package com.basketschedule;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.cognitoidentityprovider.CognitoIdentityProviderClient;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminAddUserToGroupRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDeleteUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminDisableUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminEnableUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminGetUserResponse;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminLinkProviderForUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminListGroupsForUserRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AdminRemoveUserFromGroupRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.AttributeType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.CognitoIdentityProviderException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.ListUsersInGroupRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.ListUsersRequest;
import software.amazon.awssdk.services.cognitoidentityprovider.model.ProviderUserIdentifierType;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserNotFoundException;
import software.amazon.awssdk.services.cognitoidentityprovider.model.UserType;

/** Cognito のユーザー一覧、管理者権限、利用停止を安全に管理します。 */
public final class CognitoUserAdminService {

  private static final String USER_POOL_ID = "ap-northeast-1_Cd5fxLwj3";
  private static final String ADMIN_GROUP = "admins";
  private static final String ROOT_ADMIN_GROUP = "root-admins";
  private static final int PAGE_SIZE = 60;
  private static final CognitoIdentityProviderClient SHARED_COGNITO_CLIENT =
      CognitoIdentityProviderClient.builder().region(Region.AP_NORTHEAST_1).build();

  private final CognitoIdentityProviderClient cognito;

  /** Lambda 実行ロールの権限で Cognito を操作するサービスを作成します。 */
  public CognitoUserAdminService() {
    this(SHARED_COGNITO_CLIENT);
  }

  CognitoUserAdminService(CognitoIdentityProviderClient cognito) {
    this.cognito = cognito;
  }

  /**
   * ユーザーと権限を一覧で返します。
   *
   * @return メール、状態、作成日時、グループを含むユーザー一覧
   */
  public List<Map<String, Object>> listUsers() {
    try {
      return listUsersInternal();
    } catch (CognitoIdentityProviderException e) {
      String errorCode = e.awsErrorDetails() == null ? "" : e.awsErrorDetails().errorCode();
      if ("AccessDeniedException".equals(errorCode)) {
        throw new UserAdminException(
            500,
            "USER_LIST_PERMISSION_MISSING",
            "Lambda実行ロールにCognitoユーザー一覧の権限がありません（ListUsers / ListUsersInGroup）");
      }
      throw new UserAdminException(500, "USER_LIST_FAILED", "Cognitoユーザー一覧を取得できませんでした");
    }
  }

  private List<Map<String, Object>> listUsersInternal() {
    Set<String> administrators = groupUsernames(ADMIN_GROUP);
    Set<String> rootAdministrators = groupUsernames(ROOT_ADMIN_GROUP);
    List<Map<String, Object>> result = new ArrayList<>();
    String nextToken = null;
    do {
      var response =
          cognito.listUsers(
              ListUsersRequest.builder()
                  .userPoolId(USER_POOL_ID)
                  .limit(PAGE_SIZE)
                  .paginationToken(nextToken)
                  .build());
      for (UserType user : response.users()) {
        String username = user.username();
        String role =
            rootAdministrators.contains(username)
                ? "root-admin"
                : administrators.contains(username) ? "admin" : "member";
        Map<String, Object> row = new HashMap<>();
        row.put("username", username);
        row.put("sub", attribute(user, "sub"));
        row.put("email", attribute(user, "email"));
        row.put("emailVerified", Boolean.parseBoolean(attribute(user, "email_verified")));
        row.put("enabled", user.enabled());
        row.put("status", user.userStatusAsString());
        row.put("role", role);
        row.put("createdAt", user.userCreateDate() == null ? "" : user.userCreateDate().toString());
        row.put(
            "lastModifiedAt",
            user.userLastModifiedDate() == null ? "" : user.userLastModifiedDate().toString());
        result.add(row);
      }
      nextToken = response.paginationToken();
    } while (nextToken != null && !nextToken.isBlank());

    result.sort(
        Comparator.comparing(
            user -> String.valueOf(user.get("email")).toLowerCase(java.util.Locale.ROOT)));
    return result;
  }

  /**
   * 一般管理者への昇格、または一般メンバーへの降格を行います。
   *
   * @param requesterSub 操作者の Cognito sub
   * @param username Cognito のユーザー名
   * @param action promote-admin または demote-admin
   * @return 変更後のロール
   */
  public Map<String, Object> changeRole(String requesterSub, String username, String action) {
    TargetUser target = requireTarget(username);
    Set<String> groups = groupsFor(username);
    if (requesterSub.equals(target.sub())) {
      throw new UserAdminException(409, "SELF_MANAGEMENT_BLOCKED", "自分自身の権限は変更できません");
    }
    if (groups.contains(ROOT_ADMIN_GROUP)) {
      throw new UserAdminException(409, "ROOT_ADMIN_PROTECTED", "root 管理者の権限はここから変更できません");
    }

    if ("promote-admin".equals(action)) {
      if (!groups.contains(ADMIN_GROUP)) {
        cognito.adminAddUserToGroup(
            AdminAddUserToGroupRequest.builder()
                .userPoolId(USER_POOL_ID)
                .username(username)
                .groupName(ADMIN_GROUP)
                .build());
      }
      return Map.of("username", username, "role", "admin");
    }
    if ("demote-admin".equals(action)) {
      requireAnotherEnabledAdministrator(username);
      if (groups.contains(ADMIN_GROUP)) {
        cognito.adminRemoveUserFromGroup(
            AdminRemoveUserFromGroupRequest.builder()
                .userPoolId(USER_POOL_ID)
                .username(username)
                .groupName(ADMIN_GROUP)
                .build());
      }
      return Map.of("username", username, "role", "member");
    }
    throw new UserAdminException(400, "INVALID_ACTION", "指定された権限変更を実行できません");
  }

  /**
   * Cognito アカウントを有効または無効にします。
   *
   * @param requesterSub 操作を実行する root 管理者の Cognito sub
   * @param username 対象ユーザー名
   * @param enabled 有効化するときは true
   * @return 変更後の有効状態
   */
  public Map<String, Object> setEnabled(String requesterSub, String username, boolean enabled) {
    TargetUser target = requireTarget(username);
    Set<String> groups = groupsFor(username);
    protectRootAndSelf(requesterSub, target, groups);
    if (!enabled && groups.contains(ADMIN_GROUP)) requireAnotherEnabledAdministrator(username);

    if (target.enabled() == enabled) {
      return Map.of("username", username, "enabled", enabled);
    }
    if (enabled) {
      cognito.adminEnableUser(
          AdminEnableUserRequest.builder().userPoolId(USER_POOL_ID).username(username).build());
    } else {
      cognito.adminDisableUser(
          AdminDisableUserRequest.builder().userPoolId(USER_POOL_ID).username(username).build());
    }
    return Map.of("username", username, "enabled", enabled);
  }

  /**
   * root 管理者以外のユーザーアカウントを削除します。
   *
   * @param requesterSub 操作を実行する root 管理者の Cognito sub
   * @param username 削除する Cognito ユーザー名
   * @return 削除したユーザー名
   */
  public Map<String, Object> deleteUser(String requesterSub, String username) {
    TargetUser target = requireTarget(username);
    Set<String> groups = groupsFor(username);
    protectRootAndSelf(requesterSub, target, groups);
    if (groups.contains(ADMIN_GROUP)) requireAnotherEnabledAdministrator(username);
    deleteCognitoUser(username, "USER_DELETE");
    return Map.of("username", username, "deleted", true);
  }

  /**
   * ログイン中のユーザー自身のアカウントを削除します。
   *
   * @param requesterSub 操作を実行するユーザーの Cognito sub
   * @param groups 操作者の検証済み Cognito グループ
   * @return 削除結果
   */
  public Map<String, Object> deleteOwnAccount(
      String requesterSub, String username, Set<String> groups) {
    if (groups.contains(ROOT_ADMIN_GROUP)) {
      requireAnotherEnabledRootAdministratorBySub(requesterSub);
    } else if (groups.contains(ADMIN_GROUP)) {
      requireAnotherEnabledAdministratorBySub(requesterSub);
    }
    String actualUsername = resolveUsernameBySub(requesterSub, username);
    deleteCognitoUser(actualUsername, "ACCOUNT_DELETE");
    return Map.of("deleted", true);
  }

  /** Cognito の sub から実ユーザー名を解決します。外部 IdP の内部ユーザー名にも対応します。 */
  private String resolveUsernameBySub(String sub, String preferredUsername) {
    if (sub == null || sub.isBlank()) {
      throw new UserAdminException(400, "ACCOUNT_ID_INVALID", "アカウント情報を確認できません");
    }
    if (preferredUsername != null && !preferredUsername.isBlank()) {
      try {
        TargetUser target = requireTarget(preferredUsername);
        if (sub.equals(target.sub())) return preferredUsername.trim();
      } catch (UserAdminException ignored) {
        // sub 検索で解決を続けます。
      }
    }
    try {
      var response =
          cognito.listUsers(
              ListUsersRequest.builder()
                  .userPoolId(USER_POOL_ID)
                  .filter("sub = \"" + sub.replace("\"", "") + "\"")
                  .limit(1)
                  .build());
      if (!response.users().isEmpty()) return response.users().get(0).username();
    } catch (CognitoIdentityProviderException e) {
      throw new UserAdminException(500, "ACCOUNT_LOOKUP_FAILED", "アカウント情報を確認できません");
    }
    throw new UserAdminException(404, "USER_NOT_FOUND", "ログイン中のアカウントが見つかりません");
  }

  /** Cognito の削除失敗を画面で判断できる安定したエラーへ変換します。 */
  private void deleteCognitoUser(String username, String operation) {
    try {
      cognito.adminDeleteUser(
          AdminDeleteUserRequest.builder().userPoolId(USER_POOL_ID).username(username).build());
    } catch (CognitoIdentityProviderException e) {
      String errorCode = e.awsErrorDetails() == null ? "" : e.awsErrorDetails().errorCode();
      if ("AccessDeniedException".equals(errorCode)) {
        throw new UserAdminException(
            500, operation + "_PERMISSION_MISSING", "Lambda実行ロールにCognitoのアカウント削除権限がありません");
      }
      throw new UserAdminException(409, operation + "_FAILED", "アカウントを削除できませんでした");
    }
  }

  /**
   * 現在のCognitoユーザーへGoogleの外部IDを紐付けます。
   *
   * @param username 既存Cognitoユーザーのユーザー名
   * @param destinationSub 連携先ユーザーのCognito sub
   * @param googleSubject Google IDトークンから検証済みのsub
   * @return 連携結果
   */
  public Map<String, Object> linkGoogleAccount(
      String username, String destinationSub, String googleSubject) {
    if (username == null
        || username.isBlank()
        || destinationSub == null
        || destinationSub.isBlank()
        || googleSubject == null
        || googleSubject.isBlank()) {
      throw new UserAdminException(400, "GOOGLE_LINK_INPUT_INVALID", "Google連携情報が不足しています");
    }
    try {
      // 既存ユーザーであることを確認してから、外部IDを連携します。
      TargetUser destination = requireTarget(username);
      if (!destinationSub.equals(destination.sub())) {
        throw new UserAdminException(409, "GOOGLE_LINK_TARGET_CHANGED", "ログイン状態が変わりました。再度お試しください");
      }
      String existingGoogleUsername = findUsernameByGoogleSubject(googleSubject);
      boolean temporaryUserRemoved = false;
      if (existingGoogleUsername != null && !existingGoogleUsername.equals(username)) {
        Set<String> existingGroups = groupsFor(existingGoogleUsername);
        if (existingGroups.contains(ADMIN_GROUP) || existingGroups.contains(ROOT_ADMIN_GROUP)) {
          throw new UserAdminException(
              409,
              "GOOGLE_LINK_ALREADY_USED",
              "このGoogleアカウントは管理者アカウントに連携済みです。先にそのアカウントから連携を解除してください");
        }
        // Cognito Hosted UIはGoogle認証時に一時ユーザーを自動作成するため、
        // 通常メンバーの仮ユーザーだけを削除してから同じsubを連携します。
        deleteCognitoUser(existingGoogleUsername, "GOOGLE_LINK_TEMPORARY_USER_DELETE");
        temporaryUserRemoved = true;
      }
      int attempts = temporaryUserRemoved ? 4 : 1;
      for (int attempt = 1; attempt <= attempts; attempt++) {
        try {
          linkGoogleProvider(username, googleSubject);
          break;
        } catch (CognitoIdentityProviderException e) {
          if (attempt == attempts) throw e;
          try {
            Thread.sleep(500L);
          } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw new UserAdminException(
                409, "GOOGLE_LINK_RETRY_INTERRUPTED", "Google連携を完了できませんでした");
          }
        }
      }
    } catch (CognitoIdentityProviderException e) {
      String errorCode = e.awsErrorDetails() == null ? "" : e.awsErrorDetails().errorCode();
      if ("AccessDeniedException".equals(errorCode)) {
        throw new UserAdminException(
            500, "GOOGLE_LINK_PERMISSION_MISSING", "Lambda実行ロールにCognitoのGoogle連携権限がありません");
      }
      throw new UserAdminException(
          409, "GOOGLE_LINK_FAILED", "このGoogleアカウントは別のユーザーに連携済みか、連携できない状態です");
    }
    return Map.of("linked", true, "provider", "Google");
  }

  /** Cognitoのidentities属性に保存されたGoogle userIdからユーザー名を解決します。 */
  private String findUsernameByGoogleSubject(String googleSubject) {
    String expectedUserId = "\"userId\":\"" + googleSubject.replace("\"", "") + "\"";
    String nextToken = null;
    do {
      var response =
          cognito.listUsers(
              ListUsersRequest.builder()
                  .userPoolId(USER_POOL_ID)
                  .limit(PAGE_SIZE)
                  .paginationToken(nextToken)
                  .build());
      for (UserType user : response.users()) {
        String identities = attribute(user, "identities").replaceAll("\\s+", "");
        if (identities.contains("\"providerName\":\"Google\"")
            && identities.contains(expectedUserId)) {
          return user.username();
        }
      }
      nextToken = response.paginationToken();
    } while (nextToken != null && !nextToken.isBlank());
    return null;
  }

  private void linkGoogleProvider(String destinationUsername, String googleSubject) {
    cognito.adminLinkProviderForUser(
        AdminLinkProviderForUserRequest.builder()
            .userPoolId(USER_POOL_ID)
            .destinationUser(
                ProviderUserIdentifierType.builder()
                    .providerName("Cognito")
                    .providerAttributeName("Cognito_Subject")
                    .providerAttributeValue(destinationUsername)
                    .build())
            .sourceUser(
                ProviderUserIdentifierType.builder()
                    .providerName("Google")
                    .providerAttributeName("Cognito_Subject")
                    .providerAttributeValue(googleSubject)
                    .build())
            .build());
  }

  private TargetUser requireTarget(String username) {
    if (username == null || username.isBlank() || username.length() > 128) {
      throw new UserAdminException(400, "INVALID_USERNAME", "ユーザーを選び直してください");
    }
    final AdminGetUserResponse response;
    try {
      response =
          cognito.adminGetUser(
              builder -> builder.userPoolId(USER_POOL_ID).username(username.trim()));
    } catch (UserNotFoundException e) {
      throw new UserAdminException(404, "USER_NOT_FOUND", "ユーザーが見つかりません");
    }
    String sub =
        response.userAttributes().stream()
            .filter(attribute -> "sub".equals(attribute.name()))
            .map(AttributeType::value)
            .findFirst()
            .orElse("");
    return new TargetUser(Boolean.TRUE.equals(response.enabled()), sub);
  }

  private Set<String> groupsFor(String username) {
    var response =
        cognito.adminListGroupsForUser(
            AdminListGroupsForUserRequest.builder()
                .userPoolId(USER_POOL_ID)
                .username(username)
                .build());
    Set<String> groups = new HashSet<>();
    response.groups().forEach(group -> groups.add(group.groupName()));
    return groups;
  }

  private Set<String> groupUsernames(String groupName) {
    Set<String> usernames = new HashSet<>();
    String nextToken = null;
    try {
      do {
        var response =
            cognito.listUsersInGroup(
                ListUsersInGroupRequest.builder()
                    .userPoolId(USER_POOL_ID)
                    .groupName(groupName)
                    .limit(PAGE_SIZE)
                    .nextToken(nextToken)
                    .build());
        response.users().forEach(user -> usernames.add(user.username()));
        nextToken = response.nextToken();
      } while (nextToken != null && !nextToken.isBlank());
    } catch (CognitoIdentityProviderException e) {
      String errorCode = e.awsErrorDetails() == null ? "" : e.awsErrorDetails().errorCode();
      // グループ未作成の初期状態でも、一般ユーザー一覧は表示できるようにします。
      if ("ResourceNotFoundException".equals(errorCode)) return usernames;
      throw e;
    }
    return usernames;
  }

  private void requireAnotherEnabledAdministrator(String username) {
    Set<String> allAdministrators = groupUsernames(ADMIN_GROUP);
    allAdministrators.addAll(groupUsernames(ROOT_ADMIN_GROUP));
    long otherEnabledAdmins =
        allAdministrators.stream()
            .filter(candidate -> !candidate.equals(username))
            .map(this::isEnabled)
            .filter(Boolean::booleanValue)
            .count();
    if (otherEnabledAdmins == 0) {
      throw new UserAdminException(409, "LAST_ADMIN", "有効な管理者が他にいないため、この操作はできません");
    }
  }

  private void requireAnotherEnabledAdministratorBySub(String sub) {
    Set<String> allAdministrators = groupUsernames(ADMIN_GROUP);
    allAdministrators.addAll(groupUsernames(ROOT_ADMIN_GROUP));
    for (String username : allAdministrators) {
      TargetUser user = requireTarget(username);
      if (!sub.equals(user.sub()) && user.enabled()) return;
    }
    throw new UserAdminException(409, "LAST_ADMIN", "有効な管理者が他にいないため、アカウントを削除できません");
  }

  private void requireAnotherEnabledRootAdministratorBySub(String sub) {
    for (String username : groupUsernames(ROOT_ADMIN_GROUP)) {
      TargetUser user = requireTarget(username);
      if (!sub.equals(user.sub()) && user.enabled()) return;
    }
    throw new UserAdminException(409, "LAST_ROOT_ADMIN", "root 管理者が他にいないため、このアカウントは削除できません");
  }

  private boolean isEnabled(String username) {
    return requireTarget(username).enabled();
  }

  private void protectRootAndSelf(String requesterSub, TargetUser target, Set<String> groups) {
    if (groups.contains(ROOT_ADMIN_GROUP)) {
      throw new UserAdminException(409, "ROOT_ADMIN_PROTECTED", "root 管理者アカウントは削除・停止できません");
    }
    if (requesterSub.equals(target.sub())) {
      throw new UserAdminException(409, "SELF_MANAGEMENT_BLOCKED", "自分自身の停止・削除は実行できません");
    }
  }

  private record TargetUser(boolean enabled, String sub) {}

  private static String attribute(UserType user, String name) {
    return user.attributes().stream()
        .filter(attribute -> name.equals(attribute.name()))
        .map(AttributeType::value)
        .findFirst()
        .orElse("");
  }

  /** Cognito ユーザー管理操作の安全な HTTP エラーです。 */
  public static final class UserAdminException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final int statusCode;
    private final String code;

    /**
     * クライアントへ表示する安定したエラーを作成します。
     *
     * @param statusCode HTTP ステータス
     * @param code API エラーコード
     * @param message 利用者向けメッセージ
     */
    public UserAdminException(int statusCode, String code, String message) {
      super(message);
      this.statusCode = statusCode;
      this.code = code;
    }

    public int statusCode() {
      return statusCode;
    }

    public String code() {
      return code;
    }
  }
}
