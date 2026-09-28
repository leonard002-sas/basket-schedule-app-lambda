package com.basketschedule;

import java.util.HashMap;
import java.util.Map;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

/** スケジュールイベントを DynamoDB に保存するサービスです。 */
public class DynamoDbService implements AutoCloseable {

  private final DynamoDbClient dynamoDbClient;

  /** 東京リージョンの DynamoDB クライアントを作成します。 */
  public DynamoDbService() {

    dynamoDbClient = DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build();
  }

  /**
   * 予定を DynamoDB の BasketSchedule テーブルへ保存します。
   *
   * @param event 保存する予定の開始・終了日時
   * @param timeZone 予定のタイムゾーン
   * @param facilityId 予定に紐づく施設 ID
   * @param eventType 練習または試合などの予定種別
   */
  public void saveEvent(CalendarEvent event, String timeZone, String facilityId, String eventType) {

    Map<String, AttributeValue> item = new HashMap<>();

    item.put(
        "scheduleMonth",
        AttributeValue.builder()
            .s(event.getStart().toLocalDate().toString().substring(0, 7))
            .build());

    item.put("startDateTime", AttributeValue.builder().s(event.getStart().toString()).build());

    item.put("endDateTime", AttributeValue.builder().s(event.getEnd().toString()).build());

    item.put("timeZone", AttributeValue.builder().s(timeZone).build());

    // 施設ID
    item.put("facilityId", AttributeValue.builder().s(facilityId).build());

    item.put("eventType", AttributeValue.builder().s(eventType).build());

    PutItemRequest request =
        PutItemRequest.builder().tableName("BasketSchedule").item(item).build();

    dynamoDbClient.putItem(request);
  }

  /** DynamoDB クライアントの接続資源を解放します。 */
  @Override
  public void close() {
    dynamoDbClient.close();
  }
}
