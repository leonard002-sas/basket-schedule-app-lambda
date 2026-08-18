package com.basketschedule;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.ScanRequest;

public class ScheduleApi implements RequestHandler<Map<String, Object>, String> {

    private final DynamoDbClient dynamoDbClient =
            DynamoDbClient.builder()
                    .region(Region.AP_NORTHEAST_1)
                    .build();

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public String handleRequest(
            Map<String, Object> input,
            Context context) {

        try {

            // DynamoDBに登録されている予定をすべて取得
            ScanRequest request =
                    ScanRequest.builder()
                            .tableName("BasketSchedule")
                            .build();

            var response =
                    dynamoDbClient.scan(request);

            List<Map<String, AttributeValue>> items =
                    response.items();

            context.getLogger().log(
                    "取得件数: " + items.size());

            // DynamoDBのAttributeValueを普通のJava Mapに変換
            List<Map<String, String>> result =
                    new ArrayList<>();

            for (Map<String, AttributeValue> item : items) {

                result.add(
                        Map.of(
                                "scheduleMonth",
                                item.get("scheduleMonth").s(),

                                "startDateTime",
                                item.get("startDateTime").s(),

                                "endDateTime",
                                item.get("endDateTime").s(),

                                "timeZone",
                                item.get("timeZone").s()
                        )
                );
            }

            return mapper.writeValueAsString(result);

        } catch (Exception e) {

            context.getLogger().log(
                    "ERROR: " + e.getMessage());

            throw new RuntimeException(e);
        }
    }
}