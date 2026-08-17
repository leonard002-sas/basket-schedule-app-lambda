package com.basketschedule;

import java.util.List;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;

import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.textract.TextractClient;
import software.amazon.awssdk.services.textract.model.Block;
import software.amazon.awssdk.services.textract.model.DetectDocumentTextRequest;
import software.amazon.awssdk.services.textract.model.DetectDocumentTextResponse;
import software.amazon.awssdk.services.textract.model.Document;
import software.amazon.awssdk.services.textract.model.TextractException;

public class ImageProcessor implements RequestHandler<S3Event, String> {

	@Override
	public String handleRequest(S3Event event, Context context) {

		try (
				S3Client s3Client = S3Client.builder()
						.region(Region.AP_NORTHEAST_1)
						.build();

				TextractClient textractClient = TextractClient.builder()
						.region(Region.AP_NORTHEAST_2)
						.build()) {

			event.getRecords().forEach(record -> {

				// ① S3の情報を取得
				String bucketName = record.getS3().getBucket().getName();

				String objectKey = record.getS3().getObject().getUrlDecodedKey();

				context.getLogger().log(
						"Bucket: " + bucketName);

				context.getLogger().log(
						"Object: " + objectKey);

				// ② S3から画像を取得
				GetObjectRequest s3Request = GetObjectRequest.builder()
						.bucket(bucketName)
						.key(objectKey)
						.build();

				ResponseBytes<GetObjectResponse> image = s3Client.getObjectAsBytes(s3Request);

				context.getLogger().log(
						"Image size: "
								+ image.asByteArray().length
								+ " bytes");

				// ③ Textractに渡す
				Document document = Document.builder()
						.bytes(
								software.amazon.awssdk.core.SdkBytes
										.fromByteArray(
												image.asByteArray()))
						.build();

				DetectDocumentTextRequest textractRequest = DetectDocumentTextRequest.builder()
						.document(document)
						.build();

				// ④ Textract実行
				DetectDocumentTextResponse response = textractClient.detectDocumentText(
						textractRequest);

				List<Block> lines = response.blocks().stream()
						.filter(block -> "LINE".equals(block.blockTypeAsString()))
						.toList();

				for (Block target : lines) {

					if (!"10".equals(target.text().trim())) {
						continue;
					}

					double x = target.geometry().boundingBox().left();
					double y = target.geometry().boundingBox().top();

					// ① X座標から時間帯を判定
					String timeZone = null;

					if (x >= 0.12 && x < 0.16) {
						timeZone = "午前";
					} else if (x >= 0.16 && x < 0.20) {
						timeZone = "午後";
					} else if (x >= 0.20 && x < 0.24) {
						timeZone = "夜間";
					}

					// 午前～夜間以外なら無視
					if (timeZone == null) {
						continue;
					}

					// ② 同じ行の日付を探す
					String date = null;

					double minDistance = Double.MAX_VALUE;

					for (Block dateBlock : lines) {

						String text = dateBlock.text().trim();

						double dateX = dateBlock.geometry().boundingBox().left();

						// 日付列
						if (dateX < 0.10) {

							double dateY = dateBlock.geometry().boundingBox().top();

							double distance = Math.abs(y - dateY);

							if (distance < minDistance) {

								minDistance = distance;
								date = text;
							}
						}
					}

					System.out.println(
							"★★★ 検出結果 ★★★");

					System.out.println(
							"日付: " + date);

					System.out.println(
							"時間帯: " + timeZone);

					System.out.println(
							"X: " + x);

					System.out.println(
							"Y: " + y);
				}
				// コメント
			});

		} catch (TextractException e) {

			context.getLogger().log(
					"Textract error: "
							+ e.awsErrorDetails().errorMessage());

			throw e;
		}

		return "OK";
	}
}