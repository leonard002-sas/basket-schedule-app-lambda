package com.basketschedule;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.Signature;
import java.security.interfaces.RSAPublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Lambdaが保護対象のデータへアクセスする前に、Amazon CognitoのIDトークンを検証します。
 *
 * <p>ブラウザーは {@code Authorization: Bearer} ヘッダーでトークンを送信します。このクラスはCognitoの公開鍵で署名を検証し、
 * 発行元、アプリクライアント、トークン用途、有効期限を確認します。権限判定には必ず検証済みの結果を使います。
 * ブラウザー側のグループ確認は画面の表示制御に限り、APIへのアクセス権を与えるものではありません。
 */
public final class CognitoAuth {

  private static final String CLIENT_ID = "3mr9ep2rosop9ratlg1l3bta70";
  private static final String ISSUER_PREFIX = "https://cognito-idp.ap-northeast-1.amazonaws.com/";
  private static final String TRUSTED_ISSUER =
      "https://cognito-idp.ap-northeast-1.amazonaws.com/ap-northeast-1_Cd5fxLwj3";
  private static final ObjectMapper MAPPER = new ObjectMapper();
  private static final HttpClient HTTP =
      HttpClient.newBuilder()
          .connectTimeout(Duration.ofSeconds(3))
          .followRedirects(HttpClient.Redirect.NEVER)
          .build();
  private static final Map<String, CachedKeys> KEY_CACHE = new HashMap<>();
  private static final Duration KEY_CACHE_TTL = Duration.ofHours(6);

  private CognitoAuth() {}

  /**
   * リクエストのBearerトークンを検証し、Cognitoで認証された利用者情報を返します。
   *
   * @param request リクエストヘッダーを含むLambda Function URLイベント
   * @return Cognitoで検証済みの利用者IDとグループ一覧
   * @throws AuthException 有効なトークンがない場合
   */
  public static User requireUser(Map<String, Object> request) {
    String token = bearerToken(request);
    if (token == null) {
      throw new AuthException(401, "ログインしてください", "MISSING_BEARER_TOKEN");
    }
    return verify(token);
  }

  /**
   * Bearerトークンを検証し、ユーザープールの {@code admins} グループへの所属を要求します。
   *
   * @param request リクエストヘッダーを含むLambda Function URLイベント
   * @return 管理者権限が確認された利用者情報
   * @throws AuthException トークンがない、無効、または管理者ではない場合
   */
  public static User requireAdmin(Map<String, Object> request) {
    return requireAdmin(requireUser(request));
  }

  /**
   * 検証済みの利用者に対して、指定された権限ルールを適用します。
   *
   * <p>パッケージ内からテストできる可視性にし、Cognitoへ接続せず認可ルールを検証できるようにします。
   *
   * @param user トークン検証に成功して特定された利用者
   * @return 管理者グループに所属している場合は同じ利用者情報
   * @throws AuthException 利用者が管理者ではない場合
   */
  static User requireAdmin(User user) {
    if (!user.groups().contains("admins")) {
      throw new AuthException(403, "管理者権限が必要です");
    }
    return user;
  }

  private static String bearerToken(Map<String, Object> request) {
    Object rawHeaders = request.get("headers");
    if (!(rawHeaders instanceof Map<?, ?> headers)) {
      return null;
    }

    for (Map.Entry<?, ?> entry : headers.entrySet()) {
      if (entry.getKey() != null
          && "authorization".equalsIgnoreCase(entry.getKey().toString())
          && entry.getValue() != null) {
        String value = entry.getValue().toString().trim();
        if (value.regionMatches(true, 0, "Bearer ", 0, 7)) {
          return value.substring(7).trim();
        }
      }
    }
    return null;
  }

  private static User verify(String token) {
    try {
      String[] parts = token.split("\\.", -1);
      if (parts.length != 3) {
        throw unauthorized("MALFORMED_TOKEN");
      }

      JsonNode header = MAPPER.readTree(decode(parts[0]));
      JsonNode claims = MAPPER.readTree(decode(parts[1]));
      if (!"RS256".equals(header.path("alg").asText()) || header.path("kid").asText().isBlank()) {
        throw unauthorized("INVALID_TOKEN_HEADER");
      }

      String issuer = claims.path("iss").asText();
      String trustedIssuer;
      try {
        trustedIssuer = trustedIssuer();
      } catch (Exception e) {
        throw unauthorized("OIDC_DISCOVERY_FAILED");
      }
      if (!issuer.equals(trustedIssuer) || !isAllowedIssuer(issuer)) {
        throw unauthorized("ISSUER_MISMATCH");
      }

      RSAPublicKey key;
      try {
        key = signingKey(issuer, header.path("kid").asText());
      } catch (AuthException e) {
        throw e;
      } catch (Exception e) {
        throw unauthorized("JWKS_UNAVAILABLE");
      }
      Signature verifier = Signature.getInstance("SHA256withRSA");
      verifier.initVerify(key);
      verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
      if (!verifier.verify(Base64.getUrlDecoder().decode(parts[2]))) {
        throw unauthorized("SIGNATURE_INVALID");
      }

      long now = Instant.now().getEpochSecond();
      if (!issuer.equals(claims.path("iss").asText())
          || !CLIENT_ID.equals(claims.path("aud").asText())
          || !"id".equals(claims.path("token_use").asText())
          || claims.path("exp").asLong(0) <= now
          || claims.path("iat").asLong(Long.MAX_VALUE) > now + 60) {
        throw unauthorized("CLAIMS_INVALID");
      }

      Set<String> groups = new HashSet<>();
      JsonNode groupClaims = claims.path("cognito:groups");
      if (groupClaims.isArray()) {
        groupClaims.forEach(group -> groups.add(group.asText()));
      }
      return new User(claims.path("sub").asText(), Set.copyOf(groups));
    } catch (AuthException e) {
      throw e;
    } catch (Exception e) {
      throw unauthorized("TOKEN_VALIDATION_ERROR");
    }
  }

  private static boolean isAllowedIssuer(String issuer) {
    if (issuer == null || !issuer.startsWith(ISSUER_PREFIX)) {
      return false;
    }
    String poolId = issuer.substring(ISSUER_PREFIX.length());
    return poolId.matches("ap-northeast-1_[A-Za-z0-9]+") && !poolId.contains("/");
  }

  private static String trustedIssuer() {
    return TRUSTED_ISSUER;
  }

  private static RSAPublicKey signingKey(String issuer, String kid) throws Exception {
    Map<String, RSAPublicKey> keys = loadKeys(issuer, false);
    RSAPublicKey key = keys.get(kid);
    if (key == null) {
      keys = loadKeys(issuer, true);
      key = keys.get(kid);
    }
    if (key == null) {
      throw unauthorized("JWKS_KEY_NOT_FOUND");
    }
    return key;
  }

  private static synchronized Map<String, RSAPublicKey> loadKeys(
      String issuer, boolean forceRefresh) throws Exception {
    CachedKeys cached = KEY_CACHE.get(issuer);
    if (!forceRefresh && cached != null && cached.expiresAt().isAfter(Instant.now())) {
      return cached.keys();
    }

    HttpRequest request =
        HttpRequest.newBuilder()
            .uri(URI.create(issuer + "/.well-known/jwks.json"))
            .timeout(Duration.ofSeconds(4))
            .GET()
            .build();
    HttpResponse<String> response =
        HTTP.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
    if (response.statusCode() != 200) {
      throw unauthorized();
    }

    JsonNode jwks = MAPPER.readTree(response.body()).path("keys");
    Map<String, RSAPublicKey> keys = new HashMap<>();
    for (JsonNode jwk : jwks) {
      if (!"RSA".equals(jwk.path("kty").asText()) || !"sig".equals(jwk.path("use").asText())) {
        continue;
      }
      BigInteger modulus = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("n").asText()));
      BigInteger exponent =
          new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("e").asText()));
      RSAPublicKeySpec spec = new RSAPublicKeySpec(modulus, exponent);
      RSAPublicKey publicKey = (RSAPublicKey) KeyFactory.getInstance("RSA").generatePublic(spec);
      keys.put(jwk.path("kid").asText(), publicKey);
    }
    if (keys.isEmpty()) {
      throw unauthorized();
    }

    Map<String, RSAPublicKey> immutableKeys = Map.copyOf(keys);
    KEY_CACHE.put(issuer, new CachedKeys(immutableKeys, Instant.now().plus(KEY_CACHE_TTL)));
    return immutableKeys;
  }

  private static byte[] decode(String value) {
    return Base64.getUrlDecoder().decode(value);
  }

  private static AuthException unauthorized() {
    return unauthorized("INVALID_TOKEN");
  }

  private static AuthException unauthorized(String code) {
    return new AuthException(401, "認証情報が無効または期限切れです", code);
  }

  /**
   * 検証済みCognito IDトークンから取り出した、変更できない利用者情報です。
   *
   * @param subject Cognitoが利用者に割り当てた一意の識別子
   * @param groups Cognitoで検証済みのグループ名
   */
  public record User(String subject, Set<String> groups) {
    /**
     * 検証済み利用者の変更できない情報を作成します。
     *
     * @param subject Cognitoが利用者に割り当てた一意の識別子
     * @param groups Cognitoで検証済みのグループ名
     */
    public User {
      groups = Set.copyOf(groups);
    }
  }

  private record CachedKeys(Map<String, RSAPublicKey> keys, Instant expiresAt) {}

  /** APIハンドラーが安全な応答へ変換できる認証または認可エラーです。 */
  public static final class AuthException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    /** 認証または権限エラーを表すHTTPステータスです。 */
    private final int statusCode;

    /** クライアントへ返す固定の診断コードです。 */
    private final String code;

    /**
     * APIの既定エラーコードを持つ認可エラーを作成します。
     *
     * @param statusCode APIから返すHTTPステータス
     * @param message APIの呼び出し元へ返してよいメッセージ
     */
    public AuthException(int statusCode, String message) {
      this(statusCode, message, "AUTHORIZATION_FAILED");
    }

    /**
     * APIで安全に返せる、固定の診断コードを持つ認可エラーを作成します。
     *
     * @param statusCode APIから返すHTTPステータス
     * @param message APIの呼び出し元へ返してよいメッセージ
     * @param code 内部情報を漏らさない固定のエラーコード
     */
    public AuthException(int statusCode, String message, String code) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }

    /**
     * 呼び出し元へ返すHTTPステータスを返します。
     *
     * @return HTTPステータス
     */
    public int statusCode() {
      return statusCode;
    }

    /**
     * クライアントへ返しても安全な固定の診断コードを返します。
     *
     * @return APIエラーコード
     */
    public String code() {
      return code;
    }
  }
}
