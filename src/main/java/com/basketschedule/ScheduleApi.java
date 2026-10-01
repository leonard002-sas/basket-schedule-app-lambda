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
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

/** スケジュールの取得、登録、編集、削除を行う Lambda API です。 */
public class ScheduleApi implements RequestHandler<Map<String, Object>, Map<String, Object>> {

  /** Lambda がスケジュール API ハンドラーを作成するときに使うコンストラクターです。 */
  public ScheduleApi() {}

  private static final String SCHEDULE_TABLE = ApplicationConfig.scheduleTable();

  private static final String FACILITY_TABLE = ApplicationConfig.facilityTable();

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

      String method = getHttpMethod(input);
      if ("join-request".equals(routeQuery.get("resource")) && "POST".equalsIgnoreCase(method)) {
        return saveJoinRequest(input);
      }

      CognitoAuth.User user = CognitoAuth.requireUser(input);

      String resource = routeQuery.get("resource");

      boolean attendanceRequest = "attendance".equals(resource);
      boolean profileRequest = "profile".equals(resource);
      if (("PUT".equalsIgnoreCase(method) || "DELETE".equalsIgnoreCase(method))
          && !CognitoAuth.isAdmin(user)
          && !attendanceRequest
          && !profileRequest) {
        return response(403, Map.of("message", "管理者権限が必要です"));
      }

      context.getLogger().log("HTTP Method: " + method);

      // ========================================
      // GET
      // ========================================

      if ("GET".equalsIgnoreCase(method)) {

        Map<String, String> query = getQueryParameters(input);

        if ("join-requests".equals(resource)) {
          CognitoAuth.requireAdmin(input);
          return getJoinRequests();
        }
        if ("profile".equals(resource)) return getProfile(user);

        if ("attendance".equals(resource)) return getAttendance(query, user);

        // /schedule
        if (query.containsKey("scheduleMonth") && query.containsKey("startDateTime")) {

          return getScheduleDetail(query.get("scheduleMonth"), query.get("startDateTime"));
        }

        // /schedules
        return getSchedules(CognitoAuth.isAdmin(user));
      }

      // ========================================
      // PUT
      // ========================================

      if ("PUT".equalsIgnoreCase(method)) {

        if ("attendance".equals(resource)) return saveAttendance(input, user);
        if ("profile".equals(resource)) return saveProfile(input, user);

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

  /** 未ログインユーザーからの参加申請を保存します。 */
  private Map<String, Object> saveJoinRequest(Map<String, Object> input) throws Exception {
    JsonNode body = mapper.readTree(getBody(input));
    String username = body.path("username").asText("").trim();
    String email = body.path("email").asText("").trim();
    String displayName = body.path("displayName").asText("").trim();
    String message = body.path("message").asText("").trim();
    if (username.isBlank() || email.isBlank() || displayName.isBlank())
      throw new IllegalArgumentException("名前、メールアドレス、ユーザー名は必須です");
    if (displayName.length() > 80 || message.length() > 500)
      throw new IllegalArgumentException("入力文字数が上限を超えています");
    Map<String, AttributeValue> item = new HashMap<>();
    item.put("scheduleMonth", AttributeValue.builder().s("JOIN_REQUESTS").build());
    item.put("startDateTime", AttributeValue.builder().s(username).build());
    item.put("recordType", AttributeValue.builder().s("JOIN_REQUEST").build());
    item.put("username", AttributeValue.builder().s(username).build());
    item.put("email", AttributeValue.builder().s(email).build());
    item.put("displayName", AttributeValue.builder().s(displayName).build());
    item.put("message", AttributeValue.builder().s(message).build());
    item.put("createdAt", AttributeValue.builder().s(java.time.Instant.now().toString()).build());
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(item).build());
    return response(202, Map.of("message", "参加申請を受け付けました"));
  }

  private Map<String, Object> getJoinRequests() {
    var result =
        dynamoDbClient.query(
            QueryRequest.builder()
                .tableName(SCHEDULE_TABLE)
                .keyConditionExpression("scheduleMonth = :partition")
                .expressionAttributeValues(
                    Map.of(":partition", AttributeValue.builder().s("JOIN_REQUESTS").build()))
                .build());
    List<Map<String, String>> requests = new ArrayList<>();
    for (Map<String, AttributeValue> item : result.items()) {
      Map<String, String> request = new HashMap<>();
      request.put("username", getString(item, "username"));
      request.put("email", getString(item, "email"));
      request.put("displayName", getString(item, "displayName"));
      request.put("message", getString(item, "message"));
      request.put("createdAt", getString(item, "createdAt"));
      requests.add(request);
    }
    return response(200, Map.of("items", requests));
  }

  private Map<String, Object> getProfile(CognitoAuth.User user) {
    Map<String, AttributeValue> key = new HashMap<>();
    key.put("scheduleMonth", AttributeValue.builder().s("PROFILES").build());
    key.put("startDateTime", AttributeValue.builder().s(user.subject()).build());
    var result =
        dynamoDbClient.getItem(GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(key).build());
    String displayName = result.hasItem() ? getString(result.item(), "displayName") : "";
    if (displayName.isBlank()) displayName = findJoinRequestDisplayName(user.username());
    String notificationOffsets =
        result.hasItem() ? getString(result.item(), "notificationOffsets") : "NONE";
    if (notificationOffsets.isBlank()) notificationOffsets = "NONE";
    return Map.of("displayName", displayName, "notificationOffsets", notificationOffsets);
  }

  private Map<String, Object> saveProfile(Map<String, Object> input, CognitoAuth.User user)
      throws Exception {
    JsonNode body = mapper.readTree(getBody(input));
    String displayName = body.path("displayName").asText("").trim();
    if (displayName.length() > 40) throw new IllegalArgumentException("表示名は40文字以内で入力してください");
    String notificationOffsets = body.path("notificationOffsets").asText("NONE").trim();
    if (!List.of("NONE", "DAY_BEFORE", "HOUR_BEFORE", "BOTH").contains(notificationOffsets))
      throw new IllegalArgumentException("通知設定が不正です");
    Map<String, AttributeValue> item = new HashMap<>();
    item.put("scheduleMonth", AttributeValue.builder().s("PROFILES").build());
    item.put("startDateTime", AttributeValue.builder().s(user.subject()).build());
    item.put("recordType", AttributeValue.builder().s("PROFILE").build());
    item.put("displayName", AttributeValue.builder().s(displayName).build());
    item.put("notificationOffsets", AttributeValue.builder().s(notificationOffsets).build());
    item.put("updatedAt", AttributeValue.builder().s(java.time.Instant.now().toString()).build());
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(item).build());
    return Map.of(
        "message", "プロフィールを保存しました",
        "displayName", displayName,
        "notificationOffsets", notificationOffsets);
  }

  /** 予定ごとの出欠状況を取得します。 */
  private Map<String, Object> getAttendance(Map<String, String> query, CognitoAuth.User user) {
    String scheduleMonth = requiredQuery(query, "scheduleMonth");
    String startDateTime = requiredQuery(query, "startDateTime");
    String partition = attendancePartition(scheduleMonth, startDateTime);
    var result =
        dynamoDbClient.query(
            QueryRequest.builder()
                .tableName(SCHEDULE_TABLE)
                .keyConditionExpression("scheduleMonth = :partition")
                .expressionAttributeValues(
                    Map.of(":partition", AttributeValue.builder().s(partition).build()))
                .build());
    int attending = 0, maybe = 0, absent = 0, guests = 0;
    String currentStatus = "";
    String currentComment = "";
    int currentGuestCount = 0;
    List<Map<String, String>> participants = new ArrayList<>();
    for (Map<String, AttributeValue> item : result.items()) {
      String status = getString(item, "status");
      if ("ATTENDING".equals(status)) attending++;
      else if ("MAYBE".equals(status)) maybe++;
      else if ("ABSENT".equals(status)) absent++;
      if ("ATTENDING".equals(status)) guests += integerValue(item, "guestCount", 0);
      if (user.subject().equals(getString(item, "userSub"))) {
        currentStatus = status;
        currentComment = getString(item, "comment");
        currentGuestCount = integerValue(item, "guestCount", 0);
      }
      Map<String, String> participant = new HashMap<>();
      participant.put("userSub", getString(item, "userSub"));
      participant.put("username", getString(item, "username"));
      participant.put("status", status);
      participant.put("comment", getString(item, "comment"));
      participant.put("guestCount", Integer.toString(integerValue(item, "guestCount", 0)));
      participants.add(participant);
    }
    Map<String, Object> response = new HashMap<>();
    response.put("attending", attending);
    response.put("maybe", maybe);
    response.put("absent", absent);
    response.put("guests", guests);
    response.put("total", attending + guests);
    response.put("currentStatus", currentStatus);
    response.put("currentComment", currentComment);
    response.put("currentGuestCount", currentGuestCount);
    response.put("participants", participants);
    return response;
  }

  /** ログインユーザーの出欠回答を保存します。 */
  private Map<String, Object> saveAttendance(Map<String, Object> input, CognitoAuth.User user)
      throws Exception {
    Map<String, String> query = getQueryParameters(input);
    String scheduleMonth = requiredQuery(query, "scheduleMonth");
    String scheduleStart = requiredQuery(query, "startDateTime");
    JsonNode body = mapper.readTree(getBody(input));
    String status = body.path("status").asText("").trim().toUpperCase();
    if (!List.of("ATTENDING", "MAYBE", "ABSENT").contains(status))
      throw new IllegalArgumentException("参加状況が不正です");
    String comment = body.path("comment").asText("").trim();
    if (comment.length() > 200) throw new IllegalArgumentException("コメントは200文字以内で入力してください");
    int guestCount = body.path("guestCount").asInt(0);
    if (guestCount < 0 || guestCount > 20)
      throw new IllegalArgumentException("ゲスト人数は0〜20人で入力してください");
    Map<String, AttributeValue> item = new HashMap<>();
    item.put(
        "scheduleMonth",
        AttributeValue.builder().s(attendancePartition(scheduleMonth, scheduleStart)).build());
    item.put("startDateTime", AttributeValue.builder().s(user.subject()).build());
    item.put("recordType", AttributeValue.builder().s("ATTENDANCE").build());
    item.put("userSub", AttributeValue.builder().s(user.subject()).build());
    Map<String, AttributeValue> profileKey = new HashMap<>();
    profileKey.put("scheduleMonth", AttributeValue.builder().s("PROFILES").build());
    profileKey.put("startDateTime", AttributeValue.builder().s(user.subject()).build());
    var profile =
        dynamoDbClient.getItem(
            GetItemRequest.builder().tableName(SCHEDULE_TABLE).key(profileKey).build());
    String displayName = profile.hasItem() ? getString(profile.item(), "displayName") : "";
    if (displayName.isBlank()) displayName = findJoinRequestDisplayName(user.username());
    item.put(
        "username",
        AttributeValue.builder().s(displayName.isBlank() ? user.username() : displayName).build());
    item.put("guestCount", AttributeValue.builder().s(Integer.toString(guestCount)).build());
    item.put("status", AttributeValue.builder().s(status).build());
    item.put("comment", AttributeValue.builder().s(comment).build());
    item.put("updatedAt", AttributeValue.builder().s(java.time.Instant.now().toString()).build());
    dynamoDbClient.putItem(PutItemRequest.builder().tableName(SCHEDULE_TABLE).item(item).build());
    return Map.of("message", "参加状況を保存しました", "status", status);
  }

  private String attendancePartition(String scheduleMonth, String startDateTime) {
    return "ATTENDANCE#" + scheduleMonth + "#" + startDateTime;
  }

  private String requiredQuery(Map<String, String> query, String name) {
    String value = query.get(name);
    if (value == null || value.isBlank()) throw new IllegalArgumentException(name + "がありません");
    return value;
  }

  // ========================================
  // GET /schedules
  // ========================================

  private Map<String, Object> getSchedules(boolean includeExpired) throws Exception {

    ScanRequest request = ScanRequest.builder().tableName(SCHEDULE_TABLE).build();

    var dynamoResponse = dynamoDbClient.scan(request);

    List<Map<String, String>> result = new ArrayList<>();
    List<Map<String, Object>> announcements = new ArrayList<>();
    Map<String, int[]> attendanceCounts = new HashMap<>();
    LocalDate today = LocalDate.now(ZoneId.of("Asia/Tokyo"));

    // DynamoDB の Scan 順序は保証されないため、予定を組み立てる前に出欠を集計します。
    for (Map<String, AttributeValue> item : dynamoResponse.items()) {
      if (!"ATTENDANCE".equals(getString(item, "recordType"))) continue;
      String partition = getString(item, "scheduleMonth");
      int[] counts = attendanceCounts.computeIfAbsent(partition, ignored -> new int[4]);
      String status = getString(item, "status");
      if ("ATTENDING".equals(status)) counts[0]++;
      else if ("MAYBE".equals(status)) counts[1]++;
      else if ("ABSENT".equals(status)) counts[2]++;
      if ("ATTENDING".equals(status)) counts[3] += integerValue(item, "guestCount", 0);
    }

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
      if ("ATTENDANCE".equals(getString(item, "recordType"))) continue;
      if ("JOIN_REQUEST".equals(getString(item, "recordType"))
          || "PROFILE".equals(getString(item, "recordType"))) continue;

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
      int[] counts =
          attendanceCounts.getOrDefault(
              "ATTENDANCE#"
                  + getString(item, "scheduleMonth")
                  + "#"
                  + getString(item, "startDateTime"),
              new int[4]);
      schedule.put("attendanceAttending", Integer.toString(counts[0]));
      schedule.put("attendanceMaybe", Integer.toString(counts[1]));
      schedule.put("attendanceGuests", Integer.toString(counts[3]));
      schedule.put("attendanceTotal", Integer.toString(counts[0] + counts[3]));

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

  private int integerValue(Map<String, AttributeValue> item, String name, int fallback) {
    try {
      String value = getString(item, name);
      return value.isBlank() ? fallback : Integer.parseInt(value);
    } catch (NumberFormatException e) {
      return fallback;
    }
  }

  /** 参加申請に入力された表示名を取得します。プロフィール未設定時のフォールバックです。 */
  private String findJoinRequestDisplayName(String username) {
    var result =
        dynamoDbClient.query(
            QueryRequest.builder()
                .tableName(SCHEDULE_TABLE)
                .keyConditionExpression("scheduleMonth = :partition")
                .filterExpression("username = :username")
                .expressionAttributeValues(
                    Map.of(
                        ":partition", AttributeValue.builder().s("JOIN_REQUESTS").build(),
                        ":username", AttributeValue.builder().s(username).build()))
                .limit(1)
                .build());
    if (result.items().isEmpty()) return "";
    return getString(result.items().get(0), "displayName");
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
