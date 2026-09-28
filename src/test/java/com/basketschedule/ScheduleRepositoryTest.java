package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemResponse;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemResponse;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemResponse;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanResponse;

/** AWS接続を行わず、予定リポジトリが既存のテーブルとキー形式を使うことを確認します。 */
class ScheduleRepositoryTest {

  @Test
  void readsScheduleWithExistingCompositeKeyAndTable() {
    Map<String, AttributeValue> expectedItem = new HashMap<>();
    expectedItem.put("scheduleMonth", AttributeValue.fromS("2026-10"));
    expectedItem.put("startDateTime", AttributeValue.fromS("2026-10-03T18:00"));
    AtomicReference<GetItemRequest> capturedRequest = new AtomicReference<>();

    DynamoDbClient client =
        fakeClient(
            (methodName, arguments) -> {
              if ("getItem".equals(methodName)) {
                capturedRequest.set((GetItemRequest) arguments[0]);
                return GetItemResponse.builder().item(expectedItem).build();
              }
              return null;
            });

    Map<String, AttributeValue> actualItem =
        new ScheduleRepository(client).findSchedule("2026-10", "2026-10-03T18:00");

    assertEquals(expectedItem, actualItem);
    assertEquals("BasketSchedule", capturedRequest.get().tableName());
    assertEquals("2026-10", capturedRequest.get().key().get("scheduleMonth").s());
    assertEquals("2026-10-03T18:00", capturedRequest.get().key().get("startDateTime").s());
  }

  @Test
  void missingScheduleReturnsEmptyMap() {
    DynamoDbClient client =
        fakeClient(
            (methodName, arguments) -> {
              if ("getItem".equals(methodName)) {
                return GetItemResponse.builder().build();
              }
              return null;
            });

    assertTrue(
        new ScheduleRepository(client).findSchedule("2026-10", "2026-10-03T18:00").isEmpty());
  }

  @Test
  void readsFacilityByTheExistingFacilityIdKey() {
    Map<String, AttributeValue> expectedFacility =
        Map.of(
            "facilityId", AttributeValue.fromS("facility001"),
            "facilityName", AttributeValue.fromS("落合第五小学校"));
    AtomicReference<GetItemRequest> capturedRequest = new AtomicReference<>();
    DynamoDbClient client =
        fakeClient(
            (methodName, arguments) -> {
              if ("getItem".equals(methodName)) {
                capturedRequest.set((GetItemRequest) arguments[0]);
                return GetItemResponse.builder().item(expectedFacility).build();
              }
              return null;
            });

    assertEquals(expectedFacility, new ScheduleRepository(client).findFacility("facility001"));
    assertEquals("BasketFacility", capturedRequest.get().tableName());
    assertEquals("facility001", capturedRequest.get().key().get("facilityId").s());
  }

  @Test
  void savesAndDeletesRecordsUsingTheScheduleTable() {
    AtomicReference<String> savedTable = new AtomicReference<>();
    AtomicReference<String> deletedTable = new AtomicReference<>();
    Map<String, AttributeValue> item =
        Map.of(
            "scheduleMonth", AttributeValue.fromS("2026-10"),
            "startDateTime", AttributeValue.fromS("2026-10-03T18:00"));

    DynamoDbClient client =
        fakeClient(
            (methodName, arguments) -> {
              if ("putItem".equals(methodName)) {
                savedTable.set(((PutItemRequest) arguments[0]).tableName());
                return PutItemResponse.builder().build();
              }
              if ("deleteItem".equals(methodName)) {
                deletedTable.set(((DeleteItemRequest) arguments[0]).tableName());
                return DeleteItemResponse.builder().build();
              }
              return null;
            });

    ScheduleRepository repository = new ScheduleRepository(client);
    repository.saveSchedule(item);
    repository.deleteSchedule(repository.scheduleKey("2026-10", "2026-10-03T18:00"));

    assertEquals("BasketSchedule", savedTable.get());
    assertEquals("BasketSchedule", deletedTable.get());
  }

  @Test
  void listsScheduleRecordsFromTheConfiguredTable() {
    Map<String, AttributeValue> item = Map.of("scheduleMonth", AttributeValue.fromS("2026-10"));
    AtomicReference<ScanRequest> capturedRequest = new AtomicReference<>();
    DynamoDbClient client =
        fakeClient(
            (methodName, arguments) -> {
              if ("scan".equals(methodName)) {
                capturedRequest.set((ScanRequest) arguments[0]);
                return ScanResponse.builder().items(List.of(item)).build();
              }
              return null;
            });

    assertEquals(List.of(item), new ScheduleRepository(client).listSchedules());
    assertEquals("BasketSchedule", capturedRequest.get().tableName());
  }

  private static DynamoDbClient fakeClient(DynamoCallHandler callHandler) {
    return (DynamoDbClient)
        Proxy.newProxyInstance(
            DynamoDbClient.class.getClassLoader(),
            new Class<?>[] {DynamoDbClient.class},
            (proxy, method, arguments) -> {
              if ("toString".equals(method.getName())) {
                return "Fake DynamoDB client for schedule repository test";
              }
              return callHandler.invoke(method.getName(), arguments);
            });
  }

  @FunctionalInterface
  private interface DynamoCallHandler {
    Object invoke(String methodName, Object[] arguments);
  }
}
