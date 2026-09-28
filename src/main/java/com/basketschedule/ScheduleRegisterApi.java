package com.basketschedule;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

/** 練習、試合、会議の予定を検証してDynamoDBへ登録します。 */
public class ScheduleRegisterApi
    implements RequestHandler<Map<String, Object>, Map<String, Object>> {

  /** 管理者だけが使う予定登録ハンドラーを作成します。 */
  public ScheduleRegisterApi() {}

  private final DynamoDbClient dynamoDbClient =
      DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build();

  private final ObjectMapper mapper = new ObjectMapper();

  /**
   * 管理者から送られた複数の予定を受け取り、検証して登録します。
   *
   * @param input 予定一覧のJSON本文を含むLambda Function URLイベント
   * @param context Lambdaの実行コンテキスト
   * @return 登録結果を含むHTTP形式の応答マップ
   */
  @Override
  public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {

    try {

      CognitoAuth.requireAdmin(input);

      // ========================================
      // リクエストボディ取得
      // ========================================

      String body = (String) input.get("body");

      if (body == null || body.isBlank()) {
        return response(400, "{\"message\":\"リクエストボディがありません\"}");
      }

      JsonNode root = mapper.readTree(body);

      JsonNode schedules = root.get("schedules");

      if (schedules == null || !schedules.isArray()) {
        return response(400, "{\"message\":\"schedulesが不正です\"}");
      }

      // ========================================
      // 予定登録
      // ========================================

      List<String> registered = new ArrayList<>();

      for (JsonNode schedule : schedules) {

        String date = getRequiredText(schedule, "date");

        String startTime = getRequiredText(schedule, "startTime");

        String endTime = getRequiredText(schedule, "endTime");

        String facilityId = getRequiredText(schedule, "facilityId");

        String eventType =
            schedule.hasNonNull("eventType") ? schedule.get("eventType").asText() : "PRACTICE";
        if (!"PRACTICE".equals(eventType)
            && !"GAME".equals(eventType)
            && !"MEETING".equals(eventType)) {
          throw new IllegalArgumentException("予定種別が不正です");
        }
        String competitionName = optionalText(schedule, "competitionName", 80);
        String round = optionalText(schedule, "round", 40);
        String videoUrl = optionalText(schedule, "videoUrl", 2048);
        String videoTags = optionalText(schedule, "videoTags", 120);
        validateVideoUrl(videoUrl);
        if (!"GAME".equals(eventType)) {
          competitionName = "";
          round = "";
        }

        // ------------------------------------
        // 日付・時刻チェック
        // ------------------------------------

        LocalDate localDate = LocalDate.parse(date);

        LocalTime localStartTime = LocalTime.parse(startTime);

        LocalTime localEndTime = LocalTime.parse(endTime);

        LocalDateTime startDateTime = LocalDateTime.of(localDate, localStartTime);

        LocalDateTime endDateTime = LocalDateTime.of(localDate, localEndTime);

        if (!endDateTime.isAfter(startDateTime)) {

          throw new IllegalArgumentException(
              "終了時刻が開始時刻より後ではありません: " + date + " " + startTime + "-" + endTime);
        }

        // ------------------------------------
        // 対象月
        // ------------------------------------

        String scheduleMonth =
            String.format("%04d-%02d", localDate.getYear(), localDate.getMonthValue());

        // ------------------------------------
        // 時間帯
        // ------------------------------------

        String timeZone = determineTimeZone(localStartTime, localEndTime);

        // ------------------------------------
        // DynamoDB Item
        // ------------------------------------

        Map<String, AttributeValue> item = new HashMap<>();

        item.put("scheduleMonth", AttributeValue.builder().s(scheduleMonth).build());

        item.put("startDateTime", AttributeValue.builder().s(startDateTime.toString()).build());

        item.put("endDateTime", AttributeValue.builder().s(endDateTime.toString()).build());

        item.put("timeZone", AttributeValue.builder().s(timeZone).build());

        item.put("facilityId", AttributeValue.builder().s(facilityId).build());

        item.put("eventType", AttributeValue.builder().s(eventType).build());
        if (!competitionName.isBlank())
          item.put("competitionName", AttributeValue.builder().s(competitionName).build());
        if (!round.isBlank()) item.put("round", AttributeValue.builder().s(round).build());
        if (!videoUrl.isBlank()) item.put("videoUrl", AttributeValue.builder().s(videoUrl).build());
        if (!videoTags.isBlank())
          item.put("videoTags", AttributeValue.builder().s(videoTags).build());

        PutItemRequest request =
            PutItemRequest.builder().tableName("BasketSchedule").item(item).build();

        dynamoDbClient.putItem(request);

        registered.add(startDateTime.toString());

        context
            .getLogger()
            .log(
                "予定登録: "
                    + scheduleMonth
                    + " "
                    + startDateTime
                    + " - "
                    + endDateTime
                    + " facilityId="
                    + facilityId);
      }

      String result =
          mapper.writeValueAsString(Map.of("message", "登録成功", "count", registered.size()));

      return response(200, result);

    } catch (IllegalArgumentException e) {
      try {
        return response(400, mapper.writeValueAsString(Map.of("message", e.getMessage())));
      } catch (Exception serializationError) {
        throw new RuntimeException(serializationError);
      }

    } catch (CognitoAuth.AuthException e) {

      try {
        return response(
            e.statusCode(),
            mapper.writeValueAsString(Map.of("message", e.getMessage(), "code", e.code())));
      } catch (Exception serializationError) {
        throw new RuntimeException(serializationError);
      }

    } catch (Exception e) {

      context
          .getLogger()
          .log(
              "Schedule registration failed: "
                  + e.getClass().getSimpleName()
                  + ": "
                  + e.getMessage());

      String result;

      try {
        result =
            mapper.writeValueAsString(
                Map.of(
                    "message", "登録に失敗しました",
                    "code", "INTERNAL_ERROR"));
      } catch (Exception jsonException) {
        result = "{\"message\":\"登録に失敗しました\"}";
      }

      return response(500, result);
    }
  }

  // ========================================
  // 必須文字列取得
  // ========================================

  private String getRequiredText(JsonNode node, String fieldName) {

    JsonNode value = node.get(fieldName);

    if (value == null || value.isNull() || value.asText().isBlank()) {

      throw new IllegalArgumentException(fieldName + "は必須です");
    }

    return value.asText();
  }

  private String optionalText(JsonNode node, String fieldName, int maxLength) {
    JsonNode value = node.get(fieldName);
    if (value == null || value.isNull()) return "";
    String text = value.asText().trim();
    if (text.length() > maxLength)
      throw new IllegalArgumentException(fieldName + "は" + maxLength + "文字以内で入力してください");
    return text;
  }

  private void validateVideoUrl(String value) {
    if (value.isBlank()) return;
    try {
      URI uri = URI.create(value);
      if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null)
        throw new IllegalArgumentException();
    } catch (Exception e) {
      throw new IllegalArgumentException("動画URLはhttps://から始まるURLを入力してください");
    }
  }

  // ========================================
  // 時間帯判定
  // ========================================

  private String determineTimeZone(LocalTime startTime, LocalTime endTime) {

    if (startTime.equals(LocalTime.of(9, 0)) && endTime.equals(LocalTime.of(12, 0))) {

      return "午前";
    }

    if (startTime.equals(LocalTime.of(13, 0)) && endTime.equals(LocalTime.of(17, 0))) {

      return "午後";
    }

    if (startTime.equals(LocalTime.of(18, 0)) || startTime.equals(LocalTime.of(18, 30))) {

      return "夜間";
    }

    return "その他";
  }

  // ========================================
  // APIレスポンス
  // ========================================

  private Map<String, Object> response(int statusCode, String body) {

    Map<String, String> headers = new HashMap<>();

    headers.put("Content-Type", "application/json; charset=UTF-8");

    Map<String, Object> response = new HashMap<>();

    response.put("statusCode", statusCode);

    response.put("headers", headers);

    response.put("body", body);

    return response;
  }
}
