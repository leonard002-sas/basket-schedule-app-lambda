package com.basketschedule;

import java.util.HashMap;
import java.util.Map;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

/** 画像から変換した予定を {@code BasketSchedule} DynamoDBテーブルへ保存します。 */
public class DynamoDbService {

  private final DynamoDbClient dynamoDbClient;

  /** 東京リージョンのアプリケーション用テーブルへ接続するクライアントを作成します。 */
  public DynamoDbService() {

    dynamoDbClient = DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build();
  }

  /**
   * 予定のキー、開始・終了時刻、時間帯、施設、種別をテーブルへ保存します。
   *
   * @param event 変換済みの地域時間による開始・終了日時
   * @param timeZone 元画像から読み取った時間帯
   * @param facilityId 施設を識別するID
   * @param eventType 練習、試合、会議のいずれかを表す予定種別
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

  /** AWS SDKクライアントと、保持している接続資源を解放します。 */
  public void close() {
    dynamoDbClient.close();
  }
}
