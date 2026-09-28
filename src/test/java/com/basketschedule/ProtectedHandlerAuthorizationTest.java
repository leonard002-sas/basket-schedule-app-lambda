package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** 保護対象のハンドラーがAWS利用前に匿名の読み書きを拒否することを確認します。 */
class ProtectedHandlerAuthorizationTest {

  @Test
  void scheduleApiRequiresSignInForCalendarReads() {
    assertStatus(401, new ScheduleApi().handleRequest(event("GET"), null));
  }

  @Test
  void scheduleApiRequiresAdminForCalendarChanges() {
    assertStatus(401, new ScheduleApi().handleRequest(event("PUT"), null));
    assertStatus(401, new ScheduleApi().handleRequest(event("DELETE"), null));
  }

  @Test
  void featureApisRejectAnonymousRequests() {
    assertStatus(401, new FacilityApi().handleRequest(event("GET"), null));
    assertStatus(401, new FacilityApi().handleRequest(event("POST"), null));
    assertStatus(401, new ScheduleRegisterApi().handleRequest(event("POST"), null));
    assertStatus(401, new UploadApi().handleRequest(event("POST"), null));
    assertStatus(401, new BasketballApi().handleRequest(basketballEvent("GET"), null));
    assertStatus(401, new BasketballApi().handleRequest(basketballEvent("PUT"), null));
  }

  private static Map<String, Object> event(String method) {
    return Map.of("httpMethod", method);
  }

  private static Map<String, Object> basketballEvent(String method) {
    return Map.of(
        "httpMethod",
        method,
        "queryStringParameters",
        Map.of("feature", "basketball", "resource", "teams"));
  }

  private static void assertStatus(int expectedStatus, Map<String, Object> response) {
    assertEquals(expectedStatus, response.get("statusCode"));
  }
}
