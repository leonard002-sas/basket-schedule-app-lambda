package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryResponse;

/** DynamoDBへ接続せず、スコアブック用リポジトリのページングを確認します。 */
class BasketballRepositoryTest {

  @Test
  void readsEveryPageFromTheSamePartition() {
    Map<String, AttributeValue> firstRecord = record("GAME#2026-01");
    Map<String, AttributeValue> secondRecord = record("GAME#2026-02");
    Map<String, AttributeValue> nextPageKey = key("TEAM#MAIN", "GAME#2026-01");
    List<QueryRequest> requests = new ArrayList<>();
    AtomicInteger pageNumber = new AtomicInteger();

    List<QueryResponse> pages =
        List.of(
            QueryResponse.builder()
                .items(List.of(firstRecord))
                .lastEvaluatedKey(nextPageKey)
                .build(),
            QueryResponse.builder().items(List.of(secondRecord)).build());

    DynamoDbClient fakeClient =
        (DynamoDbClient)
            Proxy.newProxyInstance(
                DynamoDbClient.class.getClassLoader(),
                new Class<?>[] {DynamoDbClient.class},
                (proxy, method, arguments) -> {
                  if ("query".equals(method.getName())) {
                    requests.add((QueryRequest) arguments[0]);
                    return pages.get(pageNumber.getAndIncrement());
                  }
                  if ("toString".equals(method.getName())) {
                    return "Fake DynamoDB client for repository test";
                  }
                  return null;
                });

    BasketballRepository repository = new BasketballRepository(fakeClient);

    List<Map<String, AttributeValue>> result = repository.findAll("TEAM#MAIN");

    assertEquals(List.of(firstRecord, secondRecord), result);
    assertEquals(2, requests.size());
    assertEquals(nextPageKey, requests.get(1).exclusiveStartKey());
    assertEquals("TEAM#MAIN", requests.get(1).expressionAttributeValues().get(":pk").s());
  }

  private static Map<String, AttributeValue> record(String sortKey) {
    Map<String, AttributeValue> item = key("TEAM#MAIN", sortKey);
    item.put("recordType", AttributeValue.fromS("GAME"));
    return item;
  }

  private static Map<String, AttributeValue> key(String partitionKey, String sortKey) {
    Map<String, AttributeValue> item = new HashMap<>();
    item.put("pk", AttributeValue.fromS(partitionKey));
    item.put("sk", AttributeValue.fromS(sortKey));
    return item;
  }
}
