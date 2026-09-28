package com.basketschedule;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

/**
 * DynamoDB上のお知らせの登録・削除と入力検証を担当します。
 *
 * <p>Lambdaハンドラーからお知らせの保存処理を分離し、予定APIの責務を小さくします。
 */
public final class AnnouncementService {

  private static final String TABLE_NAME = "BasketSchedule";
  private static final String ANNOUNCEMENT_PARTITION = "ANNOUNCEMENTS";

  private final DynamoDbClient dynamoDbClient;

  /**
   * DynamoDBクライアントを受け取り、お知らせサービスを作成します。
   *
   * @param dynamoDbClient Lambdaハンドラーで共有するDynamoDBクライアント
   */
  public AnnouncementService(DynamoDbClient dynamoDbClient) {
    this.dynamoDbClient = dynamoDbClient;
  }

  /**
   * お知らせを検証して新規登録または更新します。
   *
   * @param body お知らせ入力を含むJSONオブジェクト
   * @return API応答に含める登録結果
   */
  public Map<String, Object> save(JsonNode body) {
    if (body == null || !body.isObject()) {
      throw new IllegalArgumentException("お知らせの入力内容を確認してください");
    }

    String id = body.path("id").asText("").trim();
    if (id.isBlank()) {
      id = UUID.randomUUID().toString();
    }

    String title = required(body, "title");
    String content = required(body, "content");
    String urgency = body.path("urgency").asText("NORMAL");
    String visibleUntil = required(body, "visibleUntil");

    if (title.length() > 100 || content.length() > 2000) {
      throw new IllegalArgumentException("タイトルは100文字、本文は2000文字以内で入力してください");
    }
    if (!List.of("NORMAL", "IMPORTANT", "URGENT").contains(urgency)) {
      throw new IllegalArgumentException("緊急度が不正です");
    }
    try {
      LocalDate.parse(visibleUntil);
    } catch (DateTimeParseException exception) {
      throw new IllegalArgumentException("表示期限を確認してください（YYYY-MM-DD）");
    }

    Map<String, AttributeValue> key = announcementKey(id);
    var existing =
        dynamoDbClient.getItem(GetItemRequest.builder().tableName(TABLE_NAME).key(key).build());
    long createdAt =
        existing.hasItem() && existing.item().containsKey("createdAt")
            ? Long.parseLong(existing.item().get("createdAt").n())
            : System.currentTimeMillis();

    Map<String, AttributeValue> item = new HashMap<>(key);
    item.put("recordType", stringValue("ANNOUNCEMENT"));
    item.put("announcementId", stringValue(id));
    item.put("title", stringValue(title));
    item.put("content", stringValue(content));
    item.put("urgency", stringValue(urgency));
    item.put("visibleUntil", stringValue(visibleUntil));
    item.put("createdAt", numberValue(createdAt));
    item.put("updatedAt", numberValue(System.currentTimeMillis()));

    dynamoDbClient.putItem(PutItemRequest.builder().tableName(TABLE_NAME).item(item).build());
    return Map.of("message", "お知らせを保存しました", "id", id);
  }

  /**
   * 指定されたお知らせを削除します。
   *
   * @param id 削除するお知らせID
   * @return API応答に含める削除結果
   */
  public Map<String, Object> delete(String id) {
    if (id == null || id.isBlank()) {
      throw new IllegalArgumentException("お知らせIDがありません");
    }
    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(TABLE_NAME).key(announcementKey(id)).build());
    return Map.of("message", "お知らせを削除しました");
  }

  private static String required(JsonNode body, String fieldName) {
    String value = body.path(fieldName).asText("").trim();
    if (value.isBlank()) {
      throw new IllegalArgumentException(fieldName + "は必須です");
    }
    return value;
  }

  private static Map<String, AttributeValue> announcementKey(String id) {
    Map<String, AttributeValue> key = new HashMap<>();
    key.put("scheduleMonth", stringValue(ANNOUNCEMENT_PARTITION));
    key.put("startDateTime", stringValue(id));
    return key;
  }

  private static AttributeValue stringValue(String value) {
    return AttributeValue.builder().s(value).build();
  }

  private static AttributeValue numberValue(long value) {
    return AttributeValue.builder().n(Long.toString(value)).build();
  }
}
