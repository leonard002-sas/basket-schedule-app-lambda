package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/** 保護対象のAPIハンドラーで共通する認可ルールを確認します。 */
class CognitoAuthTest {

  @Test
  void rejectsRequestsWithoutABearerToken() {
    CognitoAuth.AuthException error =
        assertThrows(
            CognitoAuth.AuthException.class,
            () -> CognitoAuth.requireUser(Map.of("httpMethod", "GET")));

    assertEquals(401, error.statusCode());
    assertEquals("MISSING_BEARER_TOKEN", error.code());
  }

  @Test
  void allowsOnlyVerifiedAdminsToUseAdminOperations() {
    CognitoAuth.User admin = new CognitoAuth.User("admin-sub", Set.of("admins"));
    CognitoAuth.User guest = new CognitoAuth.User("guest-sub", Set.of());

    assertSame(admin, CognitoAuth.requireAdmin(admin));
    CognitoAuth.AuthException error =
        assertThrows(CognitoAuth.AuthException.class, () -> CognitoAuth.requireAdmin(guest));

    assertEquals(403, error.statusCode());
  }

  @Test
  void copiesGroupMembershipWhenCreatingIdentity() {
    var mutableGroups = new java.util.HashSet<>(Set.of("admins"));
    CognitoAuth.User user = new CognitoAuth.User("admin-sub", mutableGroups);
    mutableGroups.clear();

    assertEquals(Set.of("admins"), user.groups());
  }
}
