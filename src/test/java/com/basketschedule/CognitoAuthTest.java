package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
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
  void rejectsAdminOperationsWithoutAnAuthenticatedRequest() {
    CognitoAuth.AuthException error =
        assertThrows(
            CognitoAuth.AuthException.class,
            () -> CognitoAuth.requireAdmin(Map.of("httpMethod", "POST")));

    assertEquals(401, error.statusCode());
    assertEquals("MISSING_BEARER_TOKEN", error.code());
  }

  @Test
  void copiesGroupMembershipWhenCreatingIdentity() {
    var mutableGroups = new java.util.HashSet<>(Set.of("admins"));
    CognitoAuth.User user = new CognitoAuth.User("admin-sub", mutableGroups);
    mutableGroups.clear();

    assertEquals(Set.of("admins"), user.groups());
  }
}
