package com.basketschedule;

import java.util.HashMap;
import java.util.Map;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;

public class DynamoDbService {

    private final DynamoDbClient dynamoDbClient;

    public DynamoDbService() {

        dynamoDbClient = DynamoDbClient.builder()
                .region(Region.AP_NORTHEAST_1)
                .build();
    }

    public void saveEvent(CalendarEvent event, String timeZone) {

        Map<String, AttributeValue> item = new HashMap<>();

        item.put(
                "scheduleMonth",
                AttributeValue.builder()
                        .s(event.getStart().toLocalDate().toString().substring(0, 7))
                        .build()
        );

        item.put(
                "startDateTime",
                AttributeValue.builder()
                        .s(event.getStart().toString())
                        .build()
        );

        item.put(
                "endDateTime",
                AttributeValue.builder()
                        .s(event.getEnd().toString())
                        .build()
        );

        item.put(
                "timeZone",
                AttributeValue.builder()
                        .s(timeZone)
                        .build()
        );

        PutItemRequest request =
                PutItemRequest.builder()
                        .tableName("BasketSchedule")
                        .item(item)
                        .build();

        dynamoDbClient.putItem(request);
    }

    public void close() {
        dynamoDbClient.close();
    }
}