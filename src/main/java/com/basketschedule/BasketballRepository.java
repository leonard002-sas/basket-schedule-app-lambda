package com.basketschedule;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

/** チーム、選手、試合の記録をDynamoDBから読み書きします。 */
public final class BasketballRepository {

  /** スコアブックの全レコードを格納するテーブル名です。 */
  public static final String TABLE_NAME = "BasketballData";

  private final DynamoDbClient dynamoDbClient;

  /** Lambdaで使う東京リージョンのDynamoDBクライアントを作成します。 */
  public BasketballRepository() {
    this(DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build());
  }

  /**
   * テストや別の処理からDynamoDBクライアントを受け取ります。
   *
   * @param dynamoDbClient このリポジトリが利用するDynamoDBクライアント
   */
  public BasketballRepository(DynamoDbClient dynamoDbClient) {
    this.dynamoDbClient = dynamoDbClient;
  }

  /**
   * 1件のレコードを保存または置き換えます。
   *
   * @param item テーブルに保存する主キーを含む項目
   */
  public void save(Map<String, AttributeValue> item) {
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(TABLE_NAME).item(item).build());
  }

  /**
   * 指定した主キーのレコードを削除します。
   *
   * @param partitionKey 項目を識別するパーティションキー
   * @param sortKey 項目を識別するソートキー
   */
  public void delete(String partitionKey, String sortKey) {
    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(TABLE_NAME).key(key(partitionKey, sortKey)).build());
  }

  /**
   * 指定した主キーのレコードを強い整合性で読み込みます。
   *
   * @param partitionKey 検索するパーティションキー
   * @param sortKey 検索するソートキー
   * @return 一致した項目。存在しない場合は空のマップです
   */
  public Map<String, AttributeValue> find(String partitionKey, String sortKey) {
    return dynamoDbClient
        .getItem(
            GetItemRequest.builder()
                .tableName(TABLE_NAME)
                .key(key(partitionKey, sortKey))
                .consistentRead(true)
                .build())
        .item();
  }

  /**
   * パーティションキーとソートキーの接頭辞が一致するレコードを取得します。
   *
   * @param partitionKey 検索するパーティションキー
   * @param sortKeyPrefix ソートキーの先頭に一致する文字列
   * @return 条件に一致した項目一覧
   */
  public List<Map<String, AttributeValue>> findBySortKeyPrefix(
      String partitionKey, String sortKeyPrefix) {
    return dynamoDbClient
        .query(
            QueryRequest.builder()
                .tableName(TABLE_NAME)
                .consistentRead(true)
                .keyConditionExpression("pk = :pk AND begins_with(sk, :prefix)")
                .expressionAttributeValues(
                    Map.of(
                        ":pk", stringValue(partitionKey),
                        ":prefix", stringValue(sortKeyPrefix)))
                .build())
        .items();
  }

  /**
   * 指定したパーティションの全ページを読み込みます。 DynamoDBの1回あたりの取得上限を超えても、続きを読み取って一覧を完成させます。
   *
   * @param partitionKey 検索するパーティションキー
   * @return パーティションに属する全項目
   */
  public List<Map<String, AttributeValue>> findAll(String partitionKey) {
    List<Map<String, AttributeValue>> records = new ArrayList<>();
    Map<String, AttributeValue> nextPageKey = Map.of();

    do {
      QueryRequest.Builder request =
          QueryRequest.builder()
              .tableName(TABLE_NAME)
              .consistentRead(true)
              .keyConditionExpression("pk = :pk")
              .expressionAttributeValues(Map.of(":pk", stringValue(partitionKey)));

      if (!nextPageKey.isEmpty()) {
        request.exclusiveStartKey(nextPageKey);
      }

      var page = dynamoDbClient.query(request.build());
      records.addAll(page.items());
      nextPageKey = page.lastEvaluatedKey();
      if (nextPageKey == null) {
        nextPageKey = Map.of();
      }
    } while (!nextPageKey.isEmpty());

    return records;
  }

  /**
   * 条件式で作られたDynamoDB更新要求を実行します。
   *
   * @param request 実行する更新式と主キーを含む要求
   */
  public void update(UpdateItemRequest request) {
    dynamoDbClient.updateItem(request);
  }

  /**
   * 複数の関連レコードを1回のDynamoDBトランザクションで保存します。
   *
   * @param writes 同時に確定する書き込み操作一覧
   */
  public void transact(List<TransactWriteItem> writes) {
    dynamoDbClient.transactWriteItems(
        TransactWriteItemsRequest.builder().transactItems(writes).build());
  }

  private static Map<String, AttributeValue> key(String partitionKey, String sortKey) {
    Map<String, AttributeValue> key = new HashMap<>();
    key.put("pk", stringValue(partitionKey));
    key.put("sk", stringValue(sortKey));
    return key;
  }

  private static AttributeValue stringValue(String value) {
    return AttributeValue.builder().s(value).build();
  }
}
