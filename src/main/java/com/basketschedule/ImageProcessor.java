
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
			Context context) {

		String apiKey = System.getenv("GEMINI_API_KEY");

		try (
				S3Client s3Client = S3Client.builder()
						.region(Region.AP_NORTHEAST_1)
						.build();

				Client geminiClient = Client.builder()
						.apiKey(apiKey)
						.build()) {

			for (var record : event.getRecords()) {

				// ========================================
				// ① S3情報
				// ========================================

				String bucketName = record.getS3().getBucket().getName();

				String objectKey = record.getS3().getObject().getUrlDecodedKey();

				context.getLogger().log(
						"Bucket: " + bucketName);

				context.getLogger().log(
						"Object: " + objectKey);

				// ========================================
				// ② S3から画像取得
				// ========================================

				GetObjectRequest request = GetObjectRequest.builder()
						.bucket(bucketName)
						.key(objectKey)
						.build();

				ResponseBytes<GetObjectResponse> image = s3Client.getObjectAsBytes(request);

				byte[] imageData = image.asByteArray();

				context.getLogger().log(
						"Image size: "
								+ imageData.length
								+ " bytes");

				// ========================================
				// ③ Geminiへ画像解析依頼
				// ========================================

				Content content = Content.fromParts(

						Part.fromText("""
								この画像は学校開放日程表です。

								画像を解析して、以下の情報を抽出してください。

								【年度】
								画像に記載されている「令和○年度」を読み取ってください。
								例：
								令和7年度 → fiscalYear = 2025
								令和8年度 → fiscalYear = 2026

								【対象月】
								「学校開放日程表 ○月分」などの表記から対象月を読み取ってください。

								【予定】
								表の中から「10」と記載されているセルをすべて探してください。
								そのセルの日付と時間帯を抽出してください。

								時間帯は必ず以下のいずれかです。
								午前
								午後
								夜間

								対象月以外の日付はentriesに含めないでください。

								画像から確認できない情報は推測しないでください。

								予定がない場合はentriesを空配列にしてください。
																								"""),

						Part.fromBytes(
								imageData,
								"image/jpeg"));

				// ========================================
				// ④ GeminiのJSON形式
				// ========================================

				GenerateContentConfig config = GenerateContentConfig.builder()

						.responseMimeType(
								"application/json")

						.responseSchema(
								Schema.builder()
										.type("OBJECT")
										.properties(
												Map.of(

														"scheduleMonth",
														Schema.builder()
																.type("STRING")
																.build(),

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
																										.build()))
																				.build())
																.build()))
										.build())
						.build();

				// ========================================
				// ⑤ Gemini API呼び出し
				// ========================================

				context.getLogger().log(
						"Gemini API呼び出し開始");

				GenerateContentResponse response = geminiClient.models.generateContent(
						"gemini-3.6-flash",
						content,
						config);

				context.getLogger().log(
						"Gemini API呼び出し完了");

				// ========================================
				// ⑥ JSON解析
				// ========================================

				String json = response.text();

				context.getLogger().log(
						"Gemini JSON: " + json);

				ObjectMapper mapper = new ObjectMapper();

				CalendarResponse calendarResponse;

				try {

					calendarResponse = mapper.readValue(
							json,
							CalendarResponse.class);

				} catch (Exception e) {

					context.getLogger().log(
							"JSON解析エラー: "
									+ e.getMessage());

					throw new RuntimeException(e);
				}

				// ========================================
				// ⑦ 対象月チェック
				// ========================================
				String scheduleMonth = calendarResponse.getScheduleMonth();

				if (scheduleMonth == null
						|| !scheduleMonth.matches("\\d{4}-\\d{2}")) {

					throw new IllegalArgumentException(
							"対象月の形式が不正です: "
									+ scheduleMonth);
				}

				context.getLogger().log(
						"対象月: " + scheduleMonth);

				// ========================================
				// ⑧ DynamoDB保存
				// ========================================

				DynamoDbService dynamoDbService = new DynamoDbService();

				for (CalendarEntry entry : calendarResponse.getEntries()) {

					CalendarEvent event2 = CalendarConverter.convert(
							entry,
							scheduleMonth);

					context.getLogger().log(
							"開始: "
									+ event2.getStart()
									+ " / 終了: "
									+ event2.getEnd());

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
