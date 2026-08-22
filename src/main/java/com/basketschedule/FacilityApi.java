package com.basketschedule;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

public class FacilityApi
        implements RequestHandler<Map<String, Object>, String> {

    private final DynamoDbClient dynamoDbClient =
            DynamoDbClient.builder()
                    .region(Region.AP_NORTHEAST_1)
                    .build();

    private final ObjectMapper mapper =
            new ObjectMapper();

    @Override
    public String handleRequest(
            Map<String, Object> input,
            Context context) {

        try {

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

            return mapper.writeValueAsString(
                    facilities
            );

        } catch (Exception e) {

            context.getLogger().log(
                    "ERROR: " + e.getMessage()
            );

            throw new RuntimeException(e);
        }
    }
}