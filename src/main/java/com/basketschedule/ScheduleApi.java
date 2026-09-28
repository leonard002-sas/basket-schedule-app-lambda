package com.basketschedule;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;

/**
 * ログイン利用者向けの予定取得と、管理者向けの予定変更を扱うLambda APIです。
 *
 * <p>クエリにスコアブック機能が指定された場合は、処理を {@link BasketballApi} へ渡します。 クエリに {@code feature=basketball}
 * が含まれる場合はスコアブックAPIへ処理を渡します。 予定と周知事項は {@code BasketSchedule} DynamoDBテーブルへ保存します。
 */
public class ScheduleApi implements RequestHandler<Map<String, Object>, Map<String, Object>> {

  private final ScheduleRepository scheduleRepository;

  private final ObjectMapper mapper = new ObjectMapper();

  private final AnnouncementService announcementService;

  // Lambdaの再利用時も安全なDynamoDBクライアントを、リクエスト間で共有します。
  private final BasketballApi basketballApi = new BasketballApi();

  /** 再利用可能な予定ハンドラーとAWS SDKクライアントを作成します。 */
  public ScheduleApi() {
    this(DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build());
  }

  /**
   * 指定されたAWS SDKクライアントを使う予定APIを作成します。
   *
   * @param dynamoDbClient 予定と周知事項の保存先へ接続するクライアント
   */
  ScheduleApi(DynamoDbClient dynamoDbClient) {
    DynamoDbClient client = Objects.requireNonNull(dynamoDbClient, "dynamoDbClient");
    this.scheduleRepository = new ScheduleRepository(client);
    this.announcementService = new AnnouncementService(client);
  }

  /**
   * Cognitoの権限要件を確認し、Function URLのリクエストを該当する処理へ振り分けます。
   *
   * @param input 解析済みのAPI Gatewayイベント
   * @param context 運用ログに使うLambda実行コンテキスト
   * @return ステータス、ヘッダー、本文を含むAPI Gateway応答マップ
   */
  @Override
  public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {

    try {

      Map<String, String> routeQuery = LambdaRequestParser.queryParameters(input);
      if ("basketball".equals(routeQuery.get("feature"))) {
        return basketballApi.handleRequest(input, context);
      }

      String method = LambdaRequestParser.httpMethod(input);

      CognitoAuth.User user =
          "GET".equalsIgnoreCase(method)
              ? CognitoAuth.requireUser(input)
              : CognitoAuth.requireAdmin(input);

      String resource = routeQuery.get("resource");

      context.getLogger().log("HTTP Method: " + method);

      // ========================================
      // GETリクエストを読み取り処理へ振り分けます。
      // ========================================

      if ("GET".equalsIgnoreCase(method)) {

        Map<String, String> query = LambdaRequestParser.queryParameters(input);

        // /schedule
        if (query.containsKey("scheduleMonth") && query.containsKey("startDateTime")) {

          return getScheduleDetail(query.get("scheduleMonth"), query.get("startDateTime"));
        }

        // /schedules
        return getSchedules(user.groups().contains("admins"));
      }

      // ========================================
      // PUTリクエストを更新処理へ振り分けます。
      // ========================================

      if ("PUT".equalsIgnoreCase(method)) {

        if ("announcement".equals(resource)) {
          JsonNode body = mapper.readTree(LambdaRequestParser.body(input));
          return response(200, announcementService.save(body));
        }

        return updateSchedule(input, context);
      }

      // ========================================
      // DELETEリクエストを削除処理へ振り分けます。
      // ========================================

      if ("DELETE".equalsIgnoreCase(method)) {

        if ("announcement".equals(resource)) {
          return response(200, announcementService.delete(routeQuery.get("id")));
        }

        return deleteSchedule(input, context);
      }

      return response(405, Map.of("message", "Method Not Allowed"));

    } catch (IllegalArgumentException e) {
      return response(400, Map.of("message", e.getMessage()));

    } catch (CognitoAuth.AuthException e) {

      return response(e.statusCode(), Map.of("message", e.getMessage(), "code", e.code()));

    } catch (Exception e) {

      context
          .getLogger()
          .log("Schedule API failed: " + e.getClass().getSimpleName() + ": " + e.getMessage());

      return response(500, Map.of("message", "サーバーエラー", "code", "INTERNAL_ERROR"));
    }
  }

  // ========================================
  // GET /schedules の一覧取得です。
  // ========================================

  private Map<String, Object> getSchedules(boolean includeExpired) throws Exception {

    List<Map<String, String>> result = new ArrayList<>();
    List<Map<String, Object>> announcements = new ArrayList<>();
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Tokyo"));

    for (Map<String, AttributeValue> item : scheduleRepository.listSchedules()) {

      if ("ANNOUNCEMENT".equals(getString(item, "recordType"))) {
        String visibleUntil = getString(item, "visibleUntil");
        boolean visible = !visibleUntil.isBlank() && !LocalDate.parse(visibleUntil).isBefore(today);
        if (!visible && !includeExpired) continue;
        Map<String, Object> notice = new HashMap<>();
        notice.put("id", getString(item, "announcementId"));
        notice.put("title", getString(item, "title"));
        notice.put("content", getString(item, "content"));
        notice.put("urgency", getString(item, "urgency"));
        notice.put("visibleUntil", visibleUntil);
        notice.put("visible", visible);
        announcements.add(notice);
        continue;
      }

      Map<String, String> schedule = new HashMap<>();

      schedule.put("scheduleMonth", getString(item, "scheduleMonth"));

      schedule.put("startDateTime", getString(item, "startDateTime"));

      schedule.put("endDateTime", getString(item, "endDateTime"));

      schedule.put("facilityId", getString(item, "facilityId"));

      schedule.put("timeZone", getString(item, "timeZone"));

      schedule.put("eventType", eventTypeOrDefault(item));

      schedule.put("competitionName", getString(item, "competitionName"));
      schedule.put("round", getString(item, "round"));
      schedule.put("videoUrl", getString(item, "videoUrl"));
      schedule.put("videoTags", getString(item, "videoTags"));

      result.add(schedule);
    }

    announcements.sort(
        (a, b) ->
            Integer.compare(
                announcementPriority((String) b.get("urgency")),
                announcementPriority((String) a.get("urgency"))));
    return response(200, Map.of("items", result, "announcements", announcements));
  }

  private int announcementPriority(String urgency) {
    return switch (urgency) {
      case "URGENT" -> 3;
      case "IMPORTANT" -> 2;
      default -> 1;
    };
  }

  // ========================================
  // GET /schedule の詳細取得です。
  //
  // ?scheduleMonth=2026-09
  // &startDateTime=2026-09-05T13:00
  // ========================================

  private Map<String, Object> getScheduleDetail(String scheduleMonth, String startDateTime)
      throws Exception {

    Map<String, AttributeValue> item =
        scheduleRepository.findSchedule(scheduleMonth, startDateTime);

    if (item.isEmpty()) {

      return response(404, Map.of("message", "予定が見つかりません"));
    }

    Map<String, Object> schedule = new HashMap<>();

    String actualStartDateTime = getString(item, "startDateTime");

    String facilityId = getString(item, "facilityId");

    schedule.put("scheduleMonth", scheduleMonth);

    schedule.put("startDateTime", actualStartDateTime);

    schedule.put("endDateTime", getString(item, "endDateTime"));

    schedule.put("facilityId", facilityId);

    schedule.put("eventType", eventTypeOrDefault(item));
    schedule.put("competitionName", getString(item, "competitionName"));
    schedule.put("round", getString(item, "round"));
    schedule.put("videoUrl", getString(item, "videoUrl"));
    schedule.put("videoTags", getString(item, "videoTags"));

    // ========================================
    // 曜日
    // ========================================

    LocalDateTime dateTime = LocalDateTime.parse(actualStartDateTime);

    DayOfWeek dayOfWeek = dateTime.getDayOfWeek();

    schedule.put("dayOfWeek", toJapaneseDayOfWeek(dayOfWeek));

    // ========================================
    // 施設情報
    // ========================================

    if (facilityId != null && !facilityId.isBlank()) {

      Map<String, AttributeValue> facility = getFacility(facilityId);

      if (facility != null) {

        schedule.put("facilityName", getString(facility, "facilityName"));

        schedule.put("address", getString(facility, "address"));

        schedule.put("url", getString(facility, "url"));
      }
    }

    return response(200, schedule);
  }

  // ========================================
  // PUT /schedule の予定更新です。
  // ========================================
  //
  // リクエスト本文の例:
  //
  // {
  //   "oldScheduleMonth": "2026-09",
  //   "oldStartDateTime": "2026-09-05T13:00",
  //   "date": "2026-09-05",
  //   "startTime": "14:00",
  //   "endTime": "18:00",
  //   "facilityId": "facility001"
  // }
  //
  // ========================================

  private Map<String, Object> updateSchedule(Map<String, Object> input, Context context)
      throws Exception {

    JsonNode body = mapper.readTree(LambdaRequestParser.body(input));

    // ========================================
    // 旧キー
    // ========================================

    String oldScheduleMonth = required(body, "oldScheduleMonth");

    String oldStartDateTime = required(body, "oldStartDateTime");

    // ========================================
    // 新しい値
    // ========================================

    String date = required(body, "date");

    String startTime = required(body, "startTime");

    String endTime = required(body, "endTime");

    String facilityId = required(body, "facilityId");

    LocalDateTime newStart = LocalDateTime.parse(date + "T" + startTime);

    LocalDateTime newEnd = LocalDateTime.parse(date + "T" + endTime);

    if (!newEnd.isAfter(newStart)) {

      throw new IllegalArgumentException("終了時刻は開始時刻より後にしてください");
    }

    String newScheduleMonth =
        String.format("%04d-%02d", newStart.getYear(), newStart.getMonthValue());

    // ========================================
    // 旧データを確認
    // ========================================

    Map<String, AttributeValue> oldKey =
        scheduleRepository.scheduleKey(oldScheduleMonth, oldStartDateTime);

    Map<String, AttributeValue> oldItem =
        scheduleRepository.findSchedule(oldScheduleMonth, oldStartDateTime);

    if (oldItem.isEmpty()) {

      return response(404, Map.of("message", "編集対象の予定が見つかりません"));
    }

    String eventType =
        body.hasNonNull("eventType") ? body.get("eventType").asText() : eventTypeOrDefault(oldItem);
    if (!"PRACTICE".equals(eventType)
        && !"GAME".equals(eventType)
        && !"MEETING".equals(eventType)) {
      throw new IllegalArgumentException("予定種別が不正です");
    }
    String competitionName =
        body.hasNonNull("competitionName")
            ? body.get("competitionName").asText().trim()
            : getString(oldItem, "competitionName");
    String round =
        body.hasNonNull("round") ? body.get("round").asText().trim() : getString(oldItem, "round");
    String videoUrl =
        body.hasNonNull("videoUrl")
            ? body.get("videoUrl").asText().trim()
            : getString(oldItem, "videoUrl");
    String videoTags =
        body.hasNonNull("videoTags")
            ? body.get("videoTags").asText().trim()
            : getString(oldItem, "videoTags");
    if (competitionName.length() > 80 || round.length() > 40)
      throw new IllegalArgumentException("大会名は80文字、ラウンドは40文字以内で入力してください");
    if (videoTags.length() > 120) throw new IllegalArgumentException("動画タグは120文字以内で入力してください");
    validateVideoUrl(videoUrl);
    if (!"GAME".equals(eventType)) {
      competitionName = "";
      round = "";
    }

    // ========================================
    // 旧データ削除
    // ========================================

    scheduleRepository.deleteSchedule(oldKey);

    // ========================================
    // 新データ登録
    // ========================================

    Map<String, AttributeValue> newItem = new HashMap<>();

    newItem.put("scheduleMonth", AttributeValue.builder().s(newScheduleMonth).build());

    newItem.put("startDateTime", AttributeValue.builder().s(newStart.toString()).build());

    newItem.put("endDateTime", AttributeValue.builder().s(newEnd.toString()).build());

    newItem.put("facilityId", AttributeValue.builder().s(facilityId).build());

    newItem.put(
        "timeZone", AttributeValue.builder().s(determineTimeZone(startTime, endTime)).build());

    newItem.put("eventType", AttributeValue.builder().s(eventType).build());
    if (!competitionName.isBlank())
      newItem.put("competitionName", AttributeValue.builder().s(competitionName).build());
    if (!round.isBlank()) newItem.put("round", AttributeValue.builder().s(round).build());
    if (!videoUrl.isBlank()) newItem.put("videoUrl", AttributeValue.builder().s(videoUrl).build());
    if (!videoTags.isBlank())
      newItem.put("videoTags", AttributeValue.builder().s(videoTags).build());

    scheduleRepository.saveSchedule(newItem);

    context.getLogger().log("予定更新完了: " + newScheduleMonth + " " + newStart);

    return response(200, Map.of("message", "予定を更新しました"));
  }

  // ========================================
  // DELETE /schedule の予定削除です。
  // ========================================
  //
  // リクエスト本文の例:
  //
  // {
  //   "scheduleMonth": "2026-09",
  //   "startDateTime": "2026-09-05T13:00"
  // }
  //
  // ========================================

  private Map<String, Object> deleteSchedule(Map<String, Object> input, Context context)
      throws Exception {

    JsonNode body = mapper.readTree(LambdaRequestParser.body(input));

    String scheduleMonth = required(body, "scheduleMonth");

    String startDateTime = required(body, "startDateTime");

    Map<String, AttributeValue> key = scheduleRepository.scheduleKey(scheduleMonth, startDateTime);

    if (scheduleRepository.findSchedule(scheduleMonth, startDateTime).isEmpty()) {

      return response(404, Map.of("message", "削除対象の予定が見つかりません"));
    }

    scheduleRepository.deleteSchedule(key);

    context.getLogger().log("予定削除: " + scheduleMonth + " " + startDateTime);

    return response(200, Map.of("message", "予定を削除しました"));
  }

  // ========================================
  // 施設取得
  // ========================================

  private Map<String, AttributeValue> getFacility(String facilityId) {

    Map<String, AttributeValue> facility = scheduleRepository.findFacility(facilityId);
    return facility.isEmpty() ? null : facility;
  }

  // ========================================
  // 時間帯
  // ========================================

  private String determineTimeZone(String startTime, String endTime) {

    if ("09:00".equals(startTime) && "12:00".equals(endTime)) {

      return "午前";
    }

    if ("13:00".equals(startTime) && "17:00".equals(endTime)) {

      return "午後";
    }

    if ("18:00".equals(startTime) || "18:30".equals(startTime)) {

      return "夜間";
    }

    return "その他";
  }

  // ========================================
  // 必須項目
  // ========================================

  private String required(JsonNode node, String name) {

    JsonNode value = node.get(name);

    if (value == null || value.isNull() || value.asText().isBlank()) {

      throw new IllegalArgumentException(name + "は必須です");
    }

    return value.asText();
  }

  // ========================================
  // DynamoDBの属性値を文字列に変換します。
  // ========================================

  private String getString(Map<String, AttributeValue> item, String name) {

    AttributeValue value = item.get(name);

    if (value == null || value.s() == null) {
      return "";
    }

    return value.s();
  }

  private String eventTypeOrDefault(Map<String, AttributeValue> item) {
    String eventType = getString(item, "eventType");
    return "GAME".equals(eventType) || "MEETING".equals(eventType) ? eventType : "PRACTICE";
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
  // 曜日
  // ========================================

  private String toJapaneseDayOfWeek(DayOfWeek dayOfWeek) {

    return switch (dayOfWeek) {
      case SUNDAY -> "日";
      case MONDAY -> "月";
      case TUESDAY -> "火";
      case WEDNESDAY -> "水";
      case THURSDAY -> "木";
      case FRIDAY -> "金";
      case SATURDAY -> "土";
    };
  }

  // ========================================
  // Lambda Function URL向けのレスポンスを作成します。
  // ========================================

  private Map<String, Object> response(int statusCode, Object body) {

    Map<String, String> headers = new HashMap<>();

    headers.put("Content-Type", "application/json; charset=UTF-8");

    Map<String, Object> response = new HashMap<>();

    response.put("statusCode", statusCode);

    response.put("headers", headers);

    try {

      response.put("body", mapper.writeValueAsString(body));

    } catch (Exception e) {

      response.put("body", "{\"message\":\"レスポンス生成エラー\"}");
    }

    return response;
  }
}
