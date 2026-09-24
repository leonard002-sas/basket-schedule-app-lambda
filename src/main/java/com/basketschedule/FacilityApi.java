package com.basketschedule;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

public class FacilityApi
        implements RequestHandler<Map<String, Object>, Map<String, Object>> {

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

            String method = httpMethod(input);
            if ("POST".equalsIgnoreCase(method)) {
                CognitoAuth.requireAdmin(input);
                return createFacility(input, context);
            }
            if (!"GET".equalsIgnoreCase(method)) {
                return response(405, mapper.writeValueAsString(Map.of("message", "Method Not Allowed")));
            }

            CognitoAuth.requireUser(input);

            // ========================================
            // BasketFacilityから施設を取得
            // ========================================

            ScanRequest request =
                    ScanRequest.builder()
                            .tableName("BasketFacility")
                            .build();

            var response =
                    dynamoDbClient.scan(request);

            List<Map<String, AttributeValue>> items =
                    response.items();

            context.getLogger().log(
                    "施設取得件数: " + items.size()
            );


            // ========================================
            // JSON用データへ変換
            // ========================================

            List<Map<String, Object>> facilities =
                    new ArrayList<>();

            for (Map<String, AttributeValue> item : items) {

                // enabledを確認
                boolean enabled = false;

                if (item.containsKey("enabled")) {
                    enabled =
                            item.get("enabled").bool();
                }

                // 無効な施設は除外
                if (!enabled) {
                    continue;
                }


                Map<String, Object> facility =
                        new HashMap<>();

                facility.put(
                        "facilityId",
                        item.get("facilityId").s()
                );

                facility.put(
                        "facilityName",
                        item.get("facilityName").s()
                );

                facility.put(
                        "address",
                        item.containsKey("address")
                                ? item.get("address").s()
                                : ""
                );

                facility.put(
                        "url",
                        item.containsKey("url")
                                ? item.get("url").s()
                                : ""
                );

                facility.put(
                        "imageUrl",
                        item.containsKey("imageUrl")
                                ? item.get("imageUrl").s()
                                : ""
                );

                facility.put(
                        "enabled",
                        true
                );

                // sortOrder
                int sortOrder = 9999;

                if (item.containsKey("sortOrder")) {

                    try {

                        sortOrder =
                                Integer.parseInt(
                                        item.get("sortOrder").s()
                                );

                    } catch (Exception e) {

                        context.getLogger().log(
                                "sortOrder解析エラー: "
                                        + item.get("facilityId").s()
                        );

                    }

                }

                facility.put(
                        "sortOrder",
                        sortOrder
                );

                facilities.add(facility);
            }


            // ========================================
            // sortOrder順に並び替え
            // ========================================

            facilities.sort(
                    Comparator.comparingInt(
                            facility ->
                                    (Integer) facility.get("sortOrder")
                    )
            );


            // ========================================
            // JSONへ変換
            // ========================================

            return response(
                    200,
                    mapper.writeValueAsString(facilities)
            );

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
                        mapper.writeValueAsString(
                                Map.of("message", e.getMessage(), "code", e.code())
                        )
                );
            } catch (Exception serializationError) {
                throw new RuntimeException(serializationError);
            }

        } catch (Exception e) {

            context.getLogger().log(
                    "ERROR: " + e.getMessage()
            );

            try {
                return response(
                        500,
                        mapper.writeValueAsString(
                                Map.of("message", "施設情報を取得できませんでした")
                        )
                );
            } catch (Exception serializationError) {
                throw new RuntimeException(serializationError);
            }
        }
    }

    private Map<String, Object> createFacility(Map<String, Object> input, Context context) throws Exception {
        Object rawBody = input.get("body");
        if (rawBody == null) {
            throw new IllegalArgumentException("施設情報を入力してください");
        }
        var body = mapper.readTree(rawBody.toString());
        String name = body.path("facilityName").asText("").trim();
        String address = body.path("address").asText("").trim();
        String url = body.path("url").asText("").trim();
        if (name.isBlank()) {
            throw new IllegalArgumentException("施設名を入力してください");
        }
        if (address.isBlank()) {
            throw new IllegalArgumentException("住所を入力してください");
        }
        if (!url.isBlank()) {
            try {
                var parsed = java.net.URI.create(url);
                if (!("https".equalsIgnoreCase(parsed.getScheme())
                        || "http".equalsIgnoreCase(parsed.getScheme())) || parsed.getHost() == null) {
                    throw new IllegalArgumentException("施設URLはhttpまたはhttpsで入力してください");
                }
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("施設URLの形式を確認してください");
            }
        }

        int maxSortOrder = 0;
        var existing = dynamoDbClient.scan(ScanRequest.builder().tableName("BasketFacility").build());
        for (var item : existing.items()) {
            AttributeValue value = item.get("sortOrder");
            if (value != null && value.s() != null) {
                try {
                    maxSortOrder = Math.max(maxSortOrder, Integer.parseInt(value.s()));
                } catch (NumberFormatException ignored) {
                    // Existing entries without a numeric order are placed before new facilities.
                }
            }
        }

        String facilityId = "facility-" + UUID.randomUUID();
        Map<String, AttributeValue> item = new HashMap<>();
        item.put("facilityId", AttributeValue.builder().s(facilityId).build());
        item.put("facilityName", AttributeValue.builder().s(name).build());
        item.put("address", AttributeValue.builder().s(address).build());
        item.put("url", AttributeValue.builder().s(url).build());
        item.put("imageUrl", AttributeValue.builder().s("").build());
        item.put("enabled", AttributeValue.builder().bool(true).build());
        item.put("sortOrder", AttributeValue.builder().s(Integer.toString(maxSortOrder + 1)).build());
        dynamoDbClient.putItem(PutItemRequest.builder().tableName("BasketFacility").item(item).build());
        context.getLogger().log("施設を登録しました: " + facilityId);
        return response(201, mapper.writeValueAsString(Map.of(
                "facilityId", facilityId,
                "facilityName", name,
                "address", address,
                "url", url,
                "enabled", true,
                "sortOrder", maxSortOrder + 1
        )));
    }

    private String httpMethod(Map<String, Object> input) {
        Object rawContext = input.get("requestContext");
        if (rawContext instanceof Map<?, ?> requestContext) {
            Object rawHttp = requestContext.get("http");
            if (rawHttp instanceof Map<?, ?> http && http.get("method") != null) {
                return http.get("method").toString();
            }
        }
        Object method = input.get("httpMethod");
        return method == null ? "GET" : method.toString();
    }

    private Map<String, Object> response(int statusCode, String body) {
        return Map.of(
                "statusCode", statusCode,
                "headers", Map.of("Content-Type", "application/json; charset=UTF-8"),
                "body", body
        );
    }
}

