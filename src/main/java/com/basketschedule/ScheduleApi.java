package com.basketschedule;

import java.util.List;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;

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

            // 今回は固定で2026年9月
            String month = "2026-09";

            QueryRequest request =
                    QueryRequest.builder()
                            .tableName("BasketSchedule")
                            .keyConditionExpression("PK = :pk")
                            .expressionAttributeValues(
                                    Map.of(
                                            ":pk",
                                            AttributeValue.builder()
                                                    .s(month)
                                                    .build()
                                    )
                            )
                            .build();

            var response =
                    dynamoDbClient.query(request);

            List<Map<String, AttributeValue>> items =
                    response.items();

            context.getLogger().log(
                    "取得件数: " + items.size());

            return mapper.writeValueAsString(items);

        } catch (Exception e) {

            context.getLogger().log(
                    "ERROR: " + e.getMessage());

            throw new RuntimeException(e);
        }
    }
}