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

/** Validates Cognito ID tokens before protected handlers access AWS services. */
public final class CognitoAuth {

  private static final String CLIENT_ID = ApplicationConfig.cognitoClientId();
  private static final String ISSUER_PREFIX =
      "https://cognito-idp." + ApplicationConfig.region() + ".amazonaws.com/";
  private static final String TRUSTED_ISSUER = ApplicationConfig.cognitoIssuer();
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
   * リクエストの Bearer トークンを検証し、認証済みユーザーを返します。
   *
   * @param request Lambda に渡されたリクエスト
   * @return 検証済みのユーザー情報
   * @throws AuthException トークンがない、または検証に失敗した場合
   */
  public static User requireUser(Map<String, Object> request) {
    String token = bearerToken(request);
    if (token == null) {
      throw new AuthException(401, "ログインしてください", "MISSING_BEARER_TOKEN");
    }
    return verify(token);
  }

  /**
   * リクエストを認証し、管理者グループに所属するユーザーだけを許可します。
   *
   * @param request Lambda に渡されたリクエスト
   * @return 検証済みの管理者情報
   * @throws AuthException 未認証、または管理者ではない場合
   */
  public static User requireAdmin(Map<String, Object> request) {
    User user = requireUser(request);
    if (!isAdmin(user)) {
      throw new AuthException(403, "管理者権限が必要です");
    }
    return user;
  }

  /**
   * Cognito の信頼済み root-admins グループに属する利用者だけを許可します。
   *
   * @param request Lambda に渡されたリクエスト
   * @return 検証済みの root 管理者
   * @throws AuthException 未認証、または root 管理者ではない場合
   */
  public static User requireRootAdmin(Map<String, Object> request) {
    User user = requireUser(request);
    if (!user.groups().contains("root-admins")) {
      throw new AuthException(403, "ユーザー管理者権限が必要です", "ROOT_ADMIN_REQUIRED");
    }
    return user;
  }

  /**
   * Google認証後に発行されたCognito IDトークンを検証し、Googleのsubを返します。
   *
   * @param idToken Googleログインで取得したCognito IDトークン
   * @return Google側の不変なユーザー識別子
   * @throws AuthException Google連携情報を含まないトークンの場合
   */
  public static String requireGoogleSubject(String idToken) {
    if (idToken == null || idToken.isBlank()) {
      throw new AuthException(400, "Google認証情報を取得できませんでした", "GOOGLE_TOKEN_REQUIRED");
    }
    User user = verify(idToken);
    if (user.googleSubject().isBlank()) {
      throw new AuthException(400, "Googleアカウントの情報を確認できませんでした", "GOOGLE_IDENTITY_REQUIRED");
    }
    return user.googleSubject();
  }

  /**
   * 通常管理者または root 管理者かを調べます。
   *
   * @param user 検証済みの利用者
   * @return 管理者グループに所属していれば true
   */
  public static boolean isAdmin(User user) {
    return user.groups().contains("admins") || user.groups().contains("root-admins");
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
      return new User(
          claims.path("sub").asText(),
          claims.path("cognito:username").asText(claims.path("sub").asText()),
          Set.copyOf(groups),
          googleSubject(claims));
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

  /**
   * Google連携済みトークンから、Google側の不変なユーザー識別子を取り出します。
   *
   * @param claims Cognito IDトークンのクレーム
   * @return Googleのsub。未連携の場合は空文字
   */
  private static String googleSubject(JsonNode claims) {
    JsonNode identities = claims.path("identities");
    if (!identities.isArray()) return "";
    for (JsonNode identity : identities) {
      if ("Google".equalsIgnoreCase(identity.path("providerName").asText())) {
        return identity.path("userId").asText("");
      }
    }
    return "";
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
   * Cognito が検証したユーザーの識別情報です。
   *
   * @param subject Cognito が発行したユーザー ID
   * @param username Cognito のユーザー名
   * @param groups Cognito の署名付きトークンで確認したグループ
   * @param googleSubject 連携済みの場合のGoogle固有識別子
   */
  public record User(String subject, String username, Set<String> groups, String googleSubject) {
    /**
     * 既存コードで sub とグループだけを指定する場合の互換コンストラクターです。
     *
     * @param subject Cognito が発行したユーザー ID
     * @param groups Cognito の署名付きトークンで確認したグループ
     */
    public User(String subject, Set<String> groups) {
      this(subject, subject, groups, "");
    }

    /**
     * Google連携情報を指定しない既存コード向けコンストラクターです。
     *
     * @param subject Cognito が発行したユーザー ID
     * @param username Cognito のユーザー名
     * @param groups Cognito の署名付きトークンで確認したグループ
     */
    public User(String subject, String username, Set<String> groups) {
      this(subject, username, groups, "");
    }

    /** グループ集合をコピーし、作成後に外部から変更されないようにします。 */
    public User {
      username = username == null || username.isBlank() ? subject : username;
      groups = Set.copyOf(groups);
      googleSubject = googleSubject == null ? "" : googleSubject;
    }
  }

  private record CachedKeys(Map<String, RSAPublicKey> keys, Instant expiresAt) {}

  /** 認証または認可に失敗したことを API 層へ伝える例外です。 */
  public static final class AuthException extends RuntimeException {
    private static final long serialVersionUID = 1L;

    /** HTTP 応答に使うステータスコードです。 */
    private final int statusCode;

    /** クライアント側でエラーを判別するためのコードです。 */
    private final String code;

    /**
     * 認証・認可エラーを作成します。
     *
     * @param statusCode HTTP ステータスコード
     * @param message 利用者向けのエラーメッセージ
     */
    public AuthException(int statusCode, String message) {
      this(statusCode, message, "AUTHORIZATION_FAILED");
    }

    /**
     * エラーコードを指定して認証・認可エラーを作成します。
     *
     * @param statusCode HTTP ステータスコード
     * @param message 利用者向けのエラーメッセージ
     * @param code クライアント側で使うエラーコード
     */
    public AuthException(int statusCode, String message, String code) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }

    /**
     * HTTP ステータスコードを返します。
     *
     * @return HTTP 応答に使うコード
     */
    public int statusCode() {
      return statusCode;
    }

    /**
     * クライアント側のエラー識別コードを返します。
     *
     * @return エラーコード
     */
    public String code() {
      return code;
    }
  }
}
