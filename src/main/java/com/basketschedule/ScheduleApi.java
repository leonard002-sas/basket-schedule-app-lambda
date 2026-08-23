package com.basketschedule;

import java.time.DayOfWeek;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

public class ScheduleApi
        implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private static final String SCHEDULE_TABLE =
            "BasketSchedule";

    private static final String FACILITY_TABLE =
            "BasketFacility";

    private final DynamoDbClient dynamoDbClient =
            DynamoDbClient.builder()
                    .region(Region.AP_NORTHEAST_1)
                    .build();

    private final ObjectMapper mapper =
            new ObjectMapper();


    @Override
    public Map<String, Object> handleRequest(
            Map<String, Object> input,
            Context context) {

        try {

            String method =
                    getHttpMethod(input);

            context.getLogger().log(
                    "HTTP Method: " + method);

            // ========================================
            // GET
            // ========================================

            if ("GET".equalsIgnoreCase(method)) {

                Map<String, String> query =
                        getQueryParameters(input);

                // /schedule
                if (query.containsKey("scheduleMonth")
                        && query.containsKey("startDateTime")) {

                    return getScheduleDetail(
                            query.get("scheduleMonth"),
                            query.get("startDateTime"));
                }

                // /schedules
                return getSchedules();
            }


            // ========================================
            // PUT
            // ========================================

            if ("PUT".equalsIgnoreCase(method)) {

                return updateSchedule(
                        input,
                        context);
            }


            // ========================================
            // DELETE
            // ========================================

            if ("DELETE".equalsIgnoreCase(method)) {

                return deleteSchedule(
                        input,
                        context);
            }


            return response(
                    405,
                    Map.of(
                            "message",
                            "Method Not Allowed"
                    )
            );

        } catch (Exception e) {

            context.getLogger().log(
                    "ERROR: " + e.getMessage());

            return response(
                    500,
                    Map.of(
                            "message",
                            "サーバーエラー",
                            "error",
                            e.getMessage()
                    )
            );
        }
    }


    // ========================================
    // GET /schedules
    // ========================================

    private Map<String, Object> getSchedules()
            throws Exception {

        ScanRequest request =
                ScanRequest.builder()
                        .tableName(SCHEDULE_TABLE)
                        .build();

        var dynamoResponse =
                dynamoDbClient.scan(request);

        List<Map<String, String>> result =
                new ArrayList<>();

        for (Map<String, AttributeValue> item
                : dynamoResponse.items()) {

            Map<String, String> schedule =
                    new HashMap<>();

            schedule.put(
                    "scheduleMonth",
                    getString(
                            item,
                            "scheduleMonth")
            );

            schedule.put(
                    "startDateTime",
                    getString(
                            item,
                            "startDateTime")
            );

            schedule.put(
                    "endDateTime",
                    getString(
                            item,
                            "endDateTime")
            );

            schedule.put(
                    "facilityId",
                    getString(
                            item,
                            "facilityId")
            );

            schedule.put(
                    "timeZone",
                    getString(
                            item,
                            "timeZone")
            );

            result.add(schedule);
        }

        return response(
                200,
                result
        );
    }


    // ========================================
    // GET /schedule
    //
    // ?scheduleMonth=2026-09
    // &startDateTime=2026-09-05T13:00
    // ========================================

    private Map<String, Object> getScheduleDetail(
            String scheduleMonth,
            String startDateTime)
            throws Exception {

        Map<String, AttributeValue> key =
                new HashMap<>();

        key.put(
                "scheduleMonth",
                AttributeValue.builder()
                        .s(scheduleMonth)
                        .build()
        );

        key.put(
                "startDateTime",
                AttributeValue.builder()
                        .s(startDateTime)
                        .build()
        );

        GetItemRequest request =
                GetItemRequest.builder()
                        .tableName(SCHEDULE_TABLE)
                        .key(key)
                        .build();

        var result =
                dynamoDbClient.getItem(request);

        if (!result.hasItem()) {

            return response(
                    404,
                    Map.of(
                            "message",
                            "予定が見つかりません"
                    )
            );
        }

        Map<String, AttributeValue> item =
                result.item();

        Map<String, Object> schedule =
                new HashMap<>();

        String actualStartDateTime =
                getString(
                        item,
                        "startDateTime");

        String facilityId =
                getString(
                        item,
                        "facilityId");

        schedule.put(
                "scheduleMonth",
                scheduleMonth);

        schedule.put(
                "startDateTime",
                actualStartDateTime);

        schedule.put(
                "endDateTime",
                getString(
                        item,
                        "endDateTime"));

        schedule.put(
                "facilityId",
                facilityId);

        // ========================================
        // 曜日
        // ========================================

        LocalDateTime dateTime =
                LocalDateTime.parse(
                        actualStartDateTime);

        DayOfWeek dayOfWeek =
                dateTime.getDayOfWeek();

        schedule.put(
                "dayOfWeek",
                toJapaneseDayOfWeek(
                        dayOfWeek));

        // ========================================
        // 施設情報
        // ========================================

        if (facilityId != null
                && !facilityId.isBlank()) {

            Map<String, AttributeValue>
                    facility =
                    getFacility(
                            facilityId);

            if (facility != null) {

                schedule.put(
                        "facilityName",
                        getString(
                                facility,
                                "facilityName"));

                schedule.put(
                        "address",
                        getString(
                                facility,
                                "address"));

                schedule.put(
                        "url",
                        getString(
                                facility,
                                "url"));
            }
        }

        return response(
                200,
                schedule
        );
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

    private Map<String, Object> updateSchedule(
            Map<String, Object> input,
            Context context)
            throws Exception {

        JsonNode body =
                mapper.readTree(
                        getBody(input));

        // ========================================
        // 旧キー
        // ========================================

        String oldScheduleMonth =
                required(
                        body,
                        "oldScheduleMonth");

        String oldStartDateTime =
                required(
                        body,
                        "oldStartDateTime");

        // ========================================
        // 新しい値
        // ========================================

        String date =
                required(
                        body,
                        "date");

        String startTime =
                required(
                        body,
                        "startTime");

        String endTime =
                required(
                        body,
                        "endTime");

        String facilityId =
                required(
                        body,
                        "facilityId");

        LocalDateTime newStart =
                LocalDateTime.parse(
                        date + "T" + startTime);

        LocalDateTime newEnd =
                LocalDateTime.parse(
                        date + "T" + endTime);

        if (!newEnd.isAfter(newStart)) {

            throw new IllegalArgumentException(
                    "終了時刻は開始時刻より後にしてください"
            );
        }

        String newScheduleMonth =
                String.format(
                        "%04d-%02d",
                        newStart.getYear(),
                        newStart.getMonthValue()
                );

        // ========================================
        // 旧データを確認
        // ========================================

        Map<String, AttributeValue> oldKey =
                new HashMap<>();

        oldKey.put(
                "scheduleMonth",
                AttributeValue.builder()
                        .s(oldScheduleMonth)
                        .build()
        );

        oldKey.put(
                "startDateTime",
                AttributeValue.builder()
                        .s(oldStartDateTime)
                        .build()
        );

        var oldItem =
                dynamoDbClient.getItem(
                        GetItemRequest.builder()
                                .tableName(
                                        SCHEDULE_TABLE)
                                .key(oldKey)
                                .build()
                );

        if (!oldItem.hasItem()) {

            return response(
                    404,
                    Map.of(
                            "message",
                            "編集対象の予定が見つかりません"
                    )
            );
        }

        // ========================================
        // 旧データ削除
        // ========================================

        dynamoDbClient.deleteItem(
                DeleteItemRequest.builder()
                        .tableName(
                                SCHEDULE_TABLE)
                        .key(oldKey)
                        .build()
        );

        // ========================================
        // 新データ登録
        // ========================================

        Map<String, AttributeValue> newItem =
                new HashMap<>();

        newItem.put(
                "scheduleMonth",
                AttributeValue.builder()
                        .s(newScheduleMonth)
                        .build()
        );

        newItem.put(
                "startDateTime",
                AttributeValue.builder()
                        .s(newStart.toString())
                        .build()
        );

        newItem.put(
                "endDateTime",
                AttributeValue.builder()
                        .s(newEnd.toString())
                        .build()
        );

        newItem.put(
                "facilityId",
                AttributeValue.builder()
                        .s(facilityId)
                        .build()
        );

        newItem.put(
                "timeZone",
                AttributeValue.builder()
                        .s(
                                determineTimeZone(
                                        startTime,
                                        endTime))
                        .build()
        );

        dynamoDbClient.putItem(
                PutItemRequest.builder()
                        .tableName(
                                SCHEDULE_TABLE)
                        .item(newItem)
                        .build()
        );

        context.getLogger().log(
                "予定更新完了: "
                        + newScheduleMonth
                        + " "
                        + newStart
        );

        return response(
                200,
                Map.of(
                        "message",
                        "予定を更新しました"
                )
        );
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

    private Map<String, Object> deleteSchedule(
            Map<String, Object> input,
            Context context)
            throws Exception {

        JsonNode body =
                mapper.readTree(
                        getBody(input));

        String scheduleMonth =
                required(
                        body,
                        "scheduleMonth");

        String startDateTime =
                required(
                        body,
                        "startDateTime");

        Map<String, AttributeValue> key =
                new HashMap<>();

        key.put(
                "scheduleMonth",
                AttributeValue.builder()
                        .s(scheduleMonth)
                        .build()
        );

        key.put(
                "startDateTime",
                AttributeValue.builder()
                        .s(startDateTime)
                        .build()
        );

        var existing =
                dynamoDbClient.getItem(
                        GetItemRequest.builder()
                                .tableName(
                                        SCHEDULE_TABLE)
                                .key(key)
                                .build()
                );

        if (!existing.hasItem()) {

            return response(
                    404,
                    Map.of(
                            "message",
                            "削除対象の予定が見つかりません"
                    )
            );
        }

        dynamoDbClient.deleteItem(
                DeleteItemRequest.builder()
                        .tableName(
                                SCHEDULE_TABLE)
                        .key(key)
                        .build()
        );

        context.getLogger().log(
                "予定削除: "
                        + scheduleMonth
                        + " "
                        + startDateTime
        );

        return response(
                200,
                Map.of(
                        "message",
                        "予定を削除しました"
                )
        );
    }


    // ========================================
    // 施設取得
    // ========================================

    private Map<String, AttributeValue> getFacility(
            String facilityId) {

        Map<String, AttributeValue> key =
                Map.of(
                        "facilityId",
                        AttributeValue.builder()
                                .s(facilityId)
                                .build()
                );

        var result =
                dynamoDbClient.getItem(
                        GetItemRequest.builder()
                                .tableName(
                                        FACILITY_TABLE)
                                .key(key)
                                .build()
                );

        if (!result.hasItem()) {
            return null;
        }

        return result.item();
    }


    // ========================================
    // 時間帯
    // ========================================

    private String determineTimeZone(
            String startTime,
            String endTime) {

        if ("09:00".equals(startTime)
                && "12:00".equals(endTime)) {

            return "午前";
        }

        if ("13:00".equals(startTime)
                && "17:00".equals(endTime)) {

            return "午後";
        }

        if ("18:00".equals(startTime)
                || "18:30".equals(startTime)) {

            return "夜間";
        }

        return "その他";
    }


    // ========================================
    // HTTP Method
    // ========================================

    @SuppressWarnings("unchecked")
    private String getHttpMethod(
            Map<String, Object> input) {

        Object requestContext =
                input.get("requestContext");

        if (requestContext instanceof Map<?, ?> context) {

            Object http =
                    context.get("http");

            if (http instanceof Map<?, ?> httpMap) {

                Object method =
                        httpMap.get("method");

                if (method != null) {
                    return method.toString();
                }
            }

            Object method =
                    context.get("httpMethod");

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
    private Map<String, String> getQueryParameters(
            Map<String, Object> input) {

        Object value =
                input.get(
                        "queryStringParameters");

        if (value instanceof Map<?, ?> map) {

            Map<String, String> result =
                    new HashMap<>();

            map.forEach(
                    (key, val) ->
                            result.put(
                                    String.valueOf(key),
                                    val == null
                                            ? null
                                            : String.valueOf(val)
                            )
            );

            return result;
        }

        return Map.of();
    }


    // ========================================
    // Body
    // ========================================

    private String getBody(
            Map<String, Object> input) {

        Object body =
                input.get("body");

        if (body == null) {
            return "";
        }

        return body.toString();
    }


    // ========================================
    // 必須項目
    // ========================================

    private String required(
            JsonNode node,
            String name) {

        JsonNode value =
                node.get(name);

        if (value == null
                || value.isNull()
                || value.asText().isBlank()) {

            throw new IllegalArgumentException(
                    name + "は必須です"
            );
        }

        return value.asText();
    }


    // ========================================
    // AttributeValue → String
    // ========================================

    private String getString(
            Map<String, AttributeValue> item,
            String name) {

        AttributeValue value =
                item.get(name);

        if (value == null || value.s() == null) {
            return "";
        }

        return value.s();
    }


    // ========================================
    // 曜日
    // ========================================

    private String toJapaneseDayOfWeek(
            DayOfWeek dayOfWeek) {

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

    private Map<String, Object> response(
            int statusCode,
            Object body) {

        Map<String, String> headers =
                new HashMap<>();

        headers.put(
                "Content-Type",
                "application/json; charset=UTF-8"
        );

        Map<String, Object> response =
                new HashMap<>();

        response.put(
                "statusCode",
                statusCode
        );

        response.put(
                "headers",
                headers
        );

        try {

            response.put(
                    "body",
                    mapper.writeValueAsString(body)
            );

        } catch (Exception e) {

            response.put(
                    "body",
                    "{\"message\":\"レスポンス生成エラー\"}"
            );
        }

        return response;
    }
}