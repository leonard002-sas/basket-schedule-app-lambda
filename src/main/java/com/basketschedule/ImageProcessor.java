
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
import com.google.genai.types.ThinkingConfig;
import com.google.genai.types.ThinkingLevel;

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
				                あなたはカレンダー画像から予定を抽出する専用プログラムです。

				                画像を確認し、指定されたJSON Schemaに従って予定だけを返してください。
				                説明文、注釈、Markdown、コードフェンスは一切出力しないでください。

				                【対象月】
				                画像上部の「○年度」と「○月分」から対象年月を判断してください。
				                scheduleMonth は必ず YYYY-MM の7文字だけを出力してください。

				                例:
				                「8年度」「9月分」
				                → "2026-09"

				                【予定の抽出】
				                1. 「体育館」の列だけを確認してください。
				                2. 「午前」「午後」「夜間」の各セルを確認してください。
				                3. セルに数字の「10」が書かれている場合だけ予定として抽出してください。
				                4. そのセルの日付と時間帯を取得してください。
				                5. 「10」がないセルは出力しないでください。
				                6. 推測で予定を追加しないでください。
				                7. 同じ予定を重複して出力しないでください。

				                【重要】
				                scheduleMonth の値には YYYY-MM 以外の文字を絶対に入れないでください。

				                正しい例:
				                "2026-09"

				                間違い:
				                "2026-09-01/2026-09-30"
				                "2026-09 (説明)"
				                "2026-09 entries..."

				                JSON Schemaに従ったJSONのみを返してください。
				                """),
				        Part.fromBytes(
				                imageData,
				                "image/jpeg")
				);
				
				
				
				// ========================================
				// ⑤ Gemini API呼び出し設定
				// ========================================
				GenerateContentConfig config = GenerateContentConfig.builder()
				        .responseMimeType("application/json")

				        .thinkingConfig(
				                ThinkingConfig.builder()
				                        .thinkingLevel(new ThinkingLevel("high"))
				                        .build()
				        )

				        .responseSchema(
				                Schema.builder()
				                        .type("OBJECT")
				                        .properties(
				                                Map.of(

				                                        "scheduleMonth",
				                                        Schema.builder()
				                                                .type("STRING")
				                                                .description(
				                                                        "対象年月。YYYY-MM形式の7文字のみ。例: 2026-09"
				                                                )
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
				                                                                                        .description(
				                                                                                                "日付。1日から31日まで。例: 5日"
				                                                                                        )
				                                                                                        .build(),

				                                                                                "timeZone",
				                                                                                Schema.builder()
				                                                                                        .type("STRING")
				                                                                                        .description(
				                                                                                                "時間帯。午前、午後、夜間のいずれか"
				                                                                                        )
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


				// ========================================
				// ⑥ Gemini API呼び出し
				// ========================================

				context.getLogger().log("Gemini API呼び出し開始");
				context.getLogger().log("構文の中身です：" + content.text());

				// 統合した config を渡す
				GenerateContentResponse response = geminiClient.models.generateContent(
						"gemini-3.7-flash",
				        content,
				        config);

				context.getLogger().log("Gemini API呼び出し完了");

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
					
					String OCHIGO_ID= "facility001";
					
					dynamoDbService.saveEvent(
							event2,
							entry.getTimeZone(),
							OCHIGO_ID);
					
					String timeZone = entry.getTimeZone();

					if (!"午前".equals(timeZone)
					        && !"午後".equals(timeZone)
					        && !"夜間".equals(timeZone)) {

					    throw new IllegalArgumentException(
					            "時間帯が不正です: " + timeZone);
					}
					
					String date = entry.getDate();

					if (date == null || !date.matches("([1-9]|[12][0-9]|3[01])日")) {

					    throw new IllegalArgumentException(
					            "日付が不正です: " + date);
					}
				
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
