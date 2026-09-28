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
import java.util.UUID;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

/** スケジュールの取得、登録、編集、削除を行う Lambda API です。 */
public class ScheduleApi implements RequestHandler<Map<String, Object>, Map<String, Object>> {

  /** Lambda がスケジュール API ハンドラーを作成するときに使うコンストラクターです。 */
  public ScheduleApi() {}

  private static final String SCHEDULE_TABLE = "BasketSchedule";

  private static final String FACILITY_TABLE = "BasketFacility";

  private final DynamoDbClient dynamoDbClient =
      DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build();

  private final ObjectMapper mapper = new ObjectMapper();

  @Override
  public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {

    try {

      Map<String, String> routeQuery = getQueryParameters(input);
      if ("basketball".equals(routeQuery.get("feature"))) {
        return new BasketballApi().handleRequest(input, context);
      }

      CognitoAuth.User user = CognitoAuth.requireUser(input);

      String method = getHttpMethod(input);

      String resource = routeQuery.get("resource");

      if (("PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method))
          && !user.groups().contains("admins")) {
        return response(403, Map.of("message", "管理者権限が必要です"));
      }

      context.getLogger().log("HTTP Method: " + method);

      // ========================================
      // GET
      // ========================================

      if ("GET".equalsIgnoreCase(method)) {

        Map<String, String> query = getQueryParameters(input);

        // /schedule
        if (query.containsKey("scheduleMonth") && query.containsKey("startDateTime")) {

          return getScheduleDetail(query.get("scheduleMonth"), query.get("startDateTime"));
        }

        // /schedules
        return getSchedules(user.groups().contains("admins"));
      }

      // ========================================
      // PUT
      // ========================================

      if ("PUT".equalsIgnoreCase(method)) {

        if ("announcement".equals(resource)) return saveAnnouncement(input);

        return updateSchedule(input, context);
      }

      // ========================================
      // DELETE
      // ========================================

      if ("DELETE".equalsIgnoreCase(method)) {

        if ("announcement".equals(resource)) return deleteAnnouncement(routeQuery.get("id"));

        return deleteSchedule(input, context);
      }

      return response(405, Map.of("message", "Method Not Allowed"));

    } catch (CognitoAuth.AuthException e) {

      return response(e.statusCode(), Map.of("message", e.getMessage(), "code", e.code()));

    } catch (Exception e) {

      context.getLogger().log("ERROR: " + e.getMessage());

      return response(500, Map.of("message", "サーバーエラー", "error", e.getMessage()));
    }
  }

  // ========================================
  // GET /schedules
  // ========================================

  private Map<String, Object> getSchedules(boolean includeExpired) throws Exception {

    ScanRequest request = ScanRequest.builder().tableName(SCHEDULE_TABLE).build();

    var dynamoResponse = dynamoDbClient.scan(request);

    List<Map<String, String>> result = new ArrayList<>();
    List<Map<String, Object>> announcements = new ArrayList<>();
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Tokyo"));

    for (Map<String, AttributeValue> item : dynamoResponse.items()) {

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

  private Map<String, Object> saveAnnouncement(Map<String, Object> input) throws Exception {
    JsonNode body = mapper.readTree(getBody(input));
    String id = body.path("id").asText("").trim();
    if (id.isBlank()) id = UUID.randomUUID().toString();
    String title = required(body, "title").trim(), content = required(body, "content").trim();
    String urgency = body.path("urgency").asText("NORMAL");
    String visibleUntil = required(body, "visibleUntil");
    if (title.length() > 100 || content.length() > 2000)
      throw new IllegalArgumentException("見出しは100文字、本文は2000文字以内で入力してください");
    if (!List.of("NORMAL", "IMPORTANT", "URGENT").contains(urgency))
      throw new IllegalArgumentException("緊急度が不正です");
    try {
      LocalDate.parse(visibleUntil);
    } catch (Exception e) {
      throw new IllegalArgumentException("表示期限を確認してください（YYYY-MM-DD）");
    }
    Map<String, AttributeValue> key = new HashMap<>();
    key.put("scheduleMonth", AttributeValue.builder().s("ANNOUNCEMENTS").build());
    key.put("startDateTime", AttributeValue.builder().s(id).build());
    var old =
        dynamoDbClient.getItem(GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());
    long createdAt =
        old.hasItem() && old.item().containsKey("createdAt")
            ? Long.parseLong(old.item().get("createdAt").n())
            : System.currentTimeMillis();
    Map<String, AttributeValue> item = new HashMap<>(key);
    item.put("recordType", AttributeValue.builder().s("ANNOUNCEMENT").build());
    item.put("announcementId", AttributeValue.builder().s(id).build());
    item.put("title", AttributeValue.builder().s(title).build());
    item.put("content", AttributeValue.builder().s(content).build());
    item.put("urgency", AttributeValue.builder().s(urgency).build());
    item.put("visibleUntil", AttributeValue.builder().s(visibleUntil).build());
    item.put("createdAt", AttributeValue.builder().n(Long.toString(createdAt)).build());
    item.put(
        "updatedAt", AttributeValue.builder().n(Long.toString(System.currentTimeMillis())).build());
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(item).build());
    return response(200, Map.of("message", "周知事項を保存しました", "id", id));
  }

  private Map<String, Object> deleteAnnouncement(String id) {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("お知らせIDがありません");
    Map<String, AttributeValue> key = new HashMap<>();
    key.put("scheduleMonth", AttributeValue.builder().s("ANNOUNCEMENTS").build());
    key.put("startDateTime", AttributeValue.builder().s(id).build());
    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());
    return response(200, Map.of("message", "周知事項を削除しました"));
  }

  private int announcementPriority(String urgency) {
    return switch (urgency) {
      case "URGENT" -> 3;
      case "IMPORTANT" -> 2;
      default -> 1;
    };
  }

  // ========================================
  // GET /schedule
  //
  // ?scheduleMonth=2026-09
  // &startDateTime=2026-09-05T13:00
  // ========================================

  private Map<String, Object> getScheduleDetail(String scheduleMonth, String startDateTime)
      throws Exception {

    Map<String, AttributeValue> key = new HashMap<>();

    key.put("scheduleMonth", AttributeValue.builder().s(scheduleMonth).build());

    key.put("startDateTime", AttributeValue.builder().s(startDateTime).build());

    GetItemRequest request = GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build();

    var result = dynamoDbClient.getItem(request);

    if (!result.hasItem()) {

      return response(404, Map.of("message", "予定が見つかりません"));
    }

    Map<String, AttributeValue> item = result.item();

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
  // PUT /schedule
  // ========================================
  //
  // Body:
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

    JsonNode body = mapper.readTree(getBody(input));

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

    Map<String, AttributeValue> oldKey = new HashMap<>();

    oldKey.put("scheduleMonth", AttributeValue.builder().s(oldScheduleMonth).build());

    oldKey.put("startDateTime", AttributeValue.builder().s(oldStartDateTime).build());

    var oldItem =
        dynamoDbClient.getItem(
            GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(oldKey).build());

    if (!oldItem.hasItem()) {

      return response(404, Map.of("message", "編集対象の予定が見つかりません"));
    }

    String eventType =
        body.hasNonNull("eventType")
            ? body.get("eventType").asText()
            : eventTypeOrDefault(oldItem.item());
    if (!"PRACTICE".equals(eventType)
        && !"GAME".equals(eventType)
        && !"MEETING".equals(eventType)) {
      throw new IllegalArgumentException("予定種別が不正です");
    }
    String competitionName =
        body.hasNonNull("competitionName")
            ? body.get("competitionName").asText().trim()
            : getString(oldItem.item(), "competitionName");
    String round =
        body.hasNonNull("round")
            ? body.get("round").asText().trim()
            : getString(oldItem.item(), "round");
    String videoUrl =
        body.hasNonNull("videoUrl")
            ? body.get("videoUrl").asText().trim()
            : getString(oldItem.item(), "videoUrl");
    String videoTags =
        body.hasNonNull("videoTags")
            ? body.get("videoTags").asText().trim()
            : getString(oldItem.item(), "videoTags");
    if (competitionName.length() > 80 || round.length() > 40)
      throw new IllegalArgumentException("大会名は80文字、ラウンドは40文字以内で入力してください");
    if (videoUrl.length() > 2048 || videoTags.length() > 120)
      throw new IllegalArgumentException("動画URLは2048文字、タグは120文字以内で入力してください");
    if (!videoUrl.isBlank()) {
      try {
        URI parsedVideoUrl = URI.create(videoUrl);
        if (!"https".equalsIgnoreCase(parsedVideoUrl.getScheme())
            || parsedVideoUrl.getHost() == null) {
          throw new IllegalArgumentException("動画URLにはHTTPSの共有リンクを入力してください");
        }
      } catch (IllegalArgumentException e) {
        throw new IllegalArgumentException("動画URLを確認してください。YouTubeの共有リンクを入力できます");
      }
    }
    if (!"GAME".equals(eventType)) {
      competitionName = "";
      round = "";
    }

    // ========================================
    // 旧データ削除
    // ========================================

    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(SCHEDULE_TABLE).key(oldKey).build());

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

    dynamoDbClient.putItem(
        PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(newItem).build());

    context.getLogger().log("予定更新完了: " + newScheduleMonth + " " + newStart);

    return response(200, Map.of("message", "予定を更新しました"));
  }

  // ========================================
  // DELETE /schedule
  // ========================================
  //
  // Body:
  //
  // {
  //   "scheduleMonth": "2026-09",
  //   "startDateTime": "2026-09-05T13:00"
  // }
  //
  // ========================================

  private Map<String, Object> deleteSchedule(Map<String, Object> input, Context context)
      throws Exception {

    JsonNode body = mapper.readTree(getBody(input));

    String scheduleMonth = required(body, "scheduleMonth");

    String startDateTime = required(body, "startDateTime");

    Map<String, AttributeValue> key = new HashMap<>();

    key.put("scheduleMonth", AttributeValue.builder().s(scheduleMonth).build());

    key.put("startDateTime", AttributeValue.builder().s(startDateTime).build());

    var existing =
        dynamoDbClient.getItem(GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());

    if (!existing.hasItem()) {

      return response(404, Map.of("message", "削除対象の予定が見つかりません"));
    }

    dynamoDbClient.deleteItem(
        DeleteItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());

    context.getLogger().log("予定削除: " + scheduleMonth + " " + startDateTime);

    return response(200, Map.of("message", "予定を削除しました"));
  }

  // ========================================
  // 施設取得
  // ========================================

  private Map<String, AttributeValue> getFacility(String facilityId) {

    Map<String, AttributeValue> key =
        Map.of("facilityId", AttributeValue.builder().s(facilityId).build());

    var result =
        dynamoDbClient.getItem(GetItemRequest.builder().tableName(FACILITY_TABLE).key(key).build());

    if (!result.hasItem()) {
      return null;
    }

    return result.item();
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
  // HTTP Method
  // ========================================

  @SuppressWarnings("unchecked")
  private String getHttpMethod(Map<String, Object> input) {

    Object requestContext = input.get("requestContext");

    if (requestContext instanceof Map<?, ?> context) {

      Object http = context.get("http");

      if (http instanceof Map<?, ?> httpMap) {

        Object method = httpMap.get("method");

        if (method != null) {
          return method.toString();
        }
      }

      Object method = context.get("httpMethod");

      if (method != null) {
        return method.toString();
      }
    }

    // Function URLから単純に呼ばれた場合など
    return "GET";
  }

  // ========================================
  // Query Parameters
  // ========================================

  @SuppressWarnings("unchecked")
  private Map<String, String> getQueryParameters(Map<String, Object> input) {

    Object value = input.get("queryStringParameters");

    if (value instanceof Map<?, ?> map) {

      Map<String, String> result = new HashMap<>();

      map.forEach(
          (key, val) -> result.put(String.valueOf(key), val == null ? null : String.valueOf(val)));

      return result;
    }

    return Map.of();
  }

  // ========================================
  // Body
  // ========================================

  private String getBody(Map<String, Object> input) {

    Object body = input.get("body");

    if (body == null) {
      return "";
    }

    return body.toString();
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
  // AttributeValue → String
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
  // Response
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
