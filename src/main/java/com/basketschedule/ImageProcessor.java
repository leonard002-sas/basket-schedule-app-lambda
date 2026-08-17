package com.basketschedule;

import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;

public class ImageProcessor implements RequestHandler<S3Event, String> {

	@Override
	public String handleRequest(
	        S3Event event,
	        Context context)  {
		
		String apiKey = System.getenv("GEMINI_API_KEY");
		
	    try (
	    		
	            S3Client s3Client = S3Client.builder()
	                    .region(Region.AP_NORTHEAST_1)
	                    .build();

	    		 Client geminiClient = Client.builder()
	    	                .apiKey(apiKey)
	    	                .build()) {

	        for (var record : event.getRecords()) {

	            // ① S3情報
	            String bucketName =
	                    record.getS3().getBucket().getName();

	            String objectKey =
	                    record.getS3().getObject().getUrlDecodedKey();

	            context.getLogger().log(
	                    "Bucket: " + bucketName);

	            context.getLogger().log(
	                    "Object: " + objectKey);

	            // ② S3から画像取得
	            GetObjectRequest request =
	                    GetObjectRequest.builder()
	                            .bucket(bucketName)
	                            .key(objectKey)
	                            .build();

	            ResponseBytes<GetObjectResponse> image =
	                    s3Client.getObjectAsBytes(request);

	            byte[] imageData = image.asByteArray();

	            context.getLogger().log(
	                    "Image size: "
	                    + imageData.length
	                    + " bytes");
	            
	            Content content = Content.fromParts(
	                    Part.fromText("""
	                            この画像は学校開放日程表です。

	                            画像を視覚的に解析してください。

	                            「10」と記載されているセルをすべて探してください。

	                            「10」が記載されているセルについて、
	                            以下の情報を特定してください。

	                            ・日付
	                            ・時間帯

	                            時間帯は「午前」「午後」「夜間」のいずれかです。

	                            画像から確認できない情報を推測で追加しないでください。
	                            """),

	                    Part.fromBytes(imageData, "image/jpeg")
	            );
	            
	            GenerateContentConfig config =
	                    GenerateContentConfig.builder()
	                            .responseMimeType("application/json")
	                            .responseSchema(
	                                    Schema.builder()
	                                            .type("OBJECT")
	                                            .properties(
	                                                    Map.of(
	                                                            "entries",
	                                                            Schema.builder()
	                                                                    .type("ARRAY")
	                                                                    .items(
	                                                                            Schema.builder()
	                                                                                    .type("OBJECT")
	                                                                                    .properties(
	                                                                                            Map.of(
	                                                                                                    "date",
	                                                                                                    Schema.builder()
	                                                                                                            .type("STRING")
	                                                                                                            .build(),

	                                                                                                    "timeZone",
	                                                                                                    Schema.builder()
	                                                                                                            .type("STRING")
	                                                                                                            .build()
	                                                                                            )
	                                                                                    )
	                                                                                    .build()
	                                                                    )
	                                                                    .build()
	                                                    )
	                                            )
	                                            .build()
	                            )
	                            .build();
	            
	            context.getLogger().log(
	                    "Gemini API呼び出し開始");

	            GenerateContentResponse response =
	                    geminiClient.models.generateContent(
	                            "gemini-3.6-flash",
	                            content,
	                            config);

	            context.getLogger().log(
	                    "Gemini API呼び出し完了");
	            
	            String json = response.text();

	            ObjectMapper mapper = new ObjectMapper();

	            CalendarResponse calendarResponse;

	            
	            try {
	                calendarResponse =
	                        mapper.readValue(
	                                json,
	                                CalendarResponse.class);
	            } catch (Exception e) {

	                context.getLogger().log(
	                        "JSON解析エラー: " + e.getMessage());

	                throw new RuntimeException(e);
	            }

	            
	            DynamoDbService dynamoDbService =
	                    new DynamoDbService();

	            for (CalendarEntry entry :
	                    calendarResponse.getEntries()) {

	                CalendarEvent event2 =
	                        CalendarConverter.convert(entry);

	                context.getLogger().log(
	                        "開始: " + event2.getStart()
	                        + " / 終了: " + event2.getEnd());

	                dynamoDbService.saveEvent(
	                        event2,
	                        entry.getTimeZone());
	            }

	            dynamoDbService.close();
	            
	        }

	    } catch (Exception e) {

	        context.getLogger().log(
	                "ERROR: " + e.getMessage());

	        throw e;
	    }

	    return "OK";
	}
}