package com.basketschedule;

import java.util.List;
import java.util.Map;
import java.util.Objects;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

/**
 * 予定と施設に関するDynamoDBアクセスをまとめます。
 *
 * <p>テーブル名と主キーの形をこのクラスに集め、Lambda APIがAWS SDKの要求組み立てに依存しないようにします。
 */
final class ScheduleRepository {

  static final String SCHEDULE_TABLE = "BasketSchedule";
  static final String FACILITY_TABLE = "BasketFacility";

  private final DynamoDbClient dynamoDbClient;

  /**
   * 指定されたDynamoDBクライアントを使うリポジトリを作成します。
   *
   * @param dynamoDbClient 予定と施設の保存先へ接続するAWS SDKクライアント
   */
  ScheduleRepository(DynamoDbClient dynamoDbClient) {
    this.dynamoDbClient = Objects.requireNonNull(dynamoDbClient, "dynamoDbClient");
  }

  /**
   * 予定テーブルを一度スキャンし、取得できたレコードを返します。
   *
   * @return スキャンで得た予定と周知事項のDynamoDBレコード
   */
  List<Map<String, AttributeValue>> listSchedules() {
    return dynamoDbClient.scan(ScanRequest.builder().tableName(SCHEDULE_TABLE).build()).items();
  }

  /**
   * 月と開始日時から予定を取得します。
   *
   * @param scheduleMonth 予定の年月（YYYY-MM）
   * @param startDateTime 予定の開始日時
   * @return 予定レコード。該当する予定がない場合は空のマップ
   */
  Map<String, AttributeValue> findSchedule(String scheduleMonth, String startDateTime) {
    var response =
        dynamoDbClient.getItem(
            GetItemRequest.builder()
                .tableName(SCHEDULE_TABLE)
                .key(scheduleKey(scheduleMonth, startDateTime))
                .build());
    return response.hasItem() ? response.item() : Map.of();
  }

  /**
   * 予定テーブルで使う複合主キーを作ります。
   *
   * @param scheduleMonth 予定の年月（YYYY-MM）
   * @param startDateTime 予定の開始日時
   * @return DynamoDBの主キー
   */
  Map<String, AttributeValue> scheduleKey(String scheduleMonth, String startDateTime) {
    return Map.of(
        "scheduleMonth", stringValue(scheduleMonth),
        "startDateTime", stringValue(startDateTime));
  }

  /**
   * 施設IDから施設レコードを取得します。
   *
   * @param facilityId 取得する施設のID
   * @return 施設レコード。該当施設がない場合は空のマップ
   */
  Map<String, AttributeValue> findFacility(String facilityId) {
    var response =
        dynamoDbClient.getItem(
            GetItemRequest.builder()
                .tableName(FACILITY_TABLE)
                .key(Map.of("facilityId", stringValue(facilityId)))
                .build());
    return response.hasItem() ? response.item() : Map.of();
  }

  /**
   * 既存の予定レコードを削除します。
   *
   * @param key 削除する予定の複合主キー
   */
  void deleteSchedule(Map<String, AttributeValue> key) {
    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());
  }

  /**
   * 予定レコードを保存または置き換えます。
   *
   * @param item 保存する予定レコード
   */
  void saveSchedule(Map<String, AttributeValue> item) {
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(item).build());
  }

  /** DynamoDBの文字列属性を作成します。 */
  private AttributeValue stringValue(String value) {
    return AttributeValue.builder().s(value).build();
  }
}
