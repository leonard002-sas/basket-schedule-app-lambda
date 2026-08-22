
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
				                あなたは画像から手書きの日程表を読み取り、指定のJSON形式のみを出力するプログラムです。

				                【最重要指示】
				                - 出力するJSONの値（Value）には、指定された文字列・数値以外の説明や注釈テキストを絶対に含めないでください。
				                - 余計な解説、Markdown記法（```json など）、挨拶は一切出力せず、純粋なJSONのみを返してください。

				                【抽出手順】
				                1. scheduleMonth の算出:
				                   - 画像右上の「〇年度」を取得してください（例: 「8年度」→ 令和8年 → 西暦2026年）。
				                   - 画像上部の「〇月分」を取得してください（例: 「9月分」→ 「09」）。
				                   - これらをハイフンで繋ぎ、必ず "YYYY-MM" の7文字の形式のみで出力してください（例: "2026-09"）。
				                   - ※値の中に説明文や "entries structure..." などの余計な文字列を絶対に混ぜないでください。

				                2. entries の抽出:
				                   - 「体育館」の列にある「午前」「午後」「夜間」欄のみを確認します。
				                   - 数字の「10」が書かれているマスを探してください。
				                   - 「10」がある日の「〇日」と、その時間帯区分（"午前", "午後", "夜間"）のペアをリストにしてください。

				                【出力JSONフォーマット】
				                {
				                  "scheduleMonth": "2026-09",
				                  "entries": [
				                    {
				                      "date": "5日",
				                      "timeZone": "午後"
				                    }
				                  ]
				                }
				                """),
				        Part.fromBytes(
				                imageData,
				                "image/jpeg")
				);
				
				
				
				// ========================================
				// ⑤ Gemini API呼び出し設定（統合版）
				// ========================================

				GenerateContentConfig config = GenerateContentConfig.builder()
				        // 1. JSONのみを返すように強制
				        .responseMimeType("application/json")
				        
				        // 2. AIの回答のブレ（ハルシネーション）を極限までなくす
				        .temperature(0.0f) 
				        
				        // 3. 構造化出力（スキーマ）を定義
				        .responseSchema(
				                Schema.builder()
				                        .type("OBJECT")
				                        .properties(
				                                Map.of(
				                                        "scheduleMonth",
				                                        Schema.builder()
				                                                .type("STRING")
				                                                // スキーマ側にも説明を入れるとさらに精度が上がります
				                                                .description("必ず YYYY-MM の形式のみを出力（例: 2026-09）")
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
				// ⑥ Gemini API呼び出し
				// ========================================

				context.getLogger().log("Gemini API呼び出し開始");
				context.getLogger().log("構文の中身です：" + content.text());

				// 統合した config を渡す
				GenerateContentResponse response = geminiClient.models.generateContent(
				        "gemini-3.6-flash", 
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

					dynamoDbService.saveEvent(
							event2,
							entry.getTimeZone(),
							"施設ID");
				
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
