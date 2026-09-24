package com.basketschedule;

import java.time.Duration;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectTaggingRequest;
import software.amazon.awssdk.services.s3.model.GetObjectTaggingResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;
import software.amazon.awssdk.services.s3.model.Tag;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.PresignedPutObjectRequest;

public class UploadApi implements RequestHandler<Map<String, Object>, Map<String, Object>> {

    private final ObjectMapper mapper = new ObjectMapper();

    @Override
    public Map<String, Object> handleRequest(
            Map<String, Object> input,
            Context context) {

        try {

            CognitoAuth.requireAdmin(input);

            if ("GET".equalsIgnoreCase(httpMethod(input))) {
                return getProcessingStatus(input);
            }

            if (!"POST".equalsIgnoreCase(httpMethod(input))) {
                return response(
                        405,
                        mapper.writeValueAsString(
                                Map.of("message", "Method Not Allowed")
                        )
                );
            }

            // S3バケット
            String bucketName =
                    "basket-schedule-app-images-002";

            // アップロードするファイル名
            String fileName =
                    "schedule-" + System.currentTimeMillis() + ".jpg";

            String contentType = requestedContentType(input);

            try (S3Presigner presigner =
                         S3Presigner.builder()
                                 .region(Region.AP_NORTHEAST_1)
                                 .build()) {

                PutObjectRequest putObjectRequest =
                        PutObjectRequest.builder()
                        .bucket(bucketName)
                        .key(fileName)
                        .contentType(contentType)
                        .build();

                PresignedPutObjectRequest presignedRequest =
                        presigner.presignPutObject(
                                request -> request
                                        .signatureDuration(
                                                Duration.ofMinutes(5))
                                        .putObjectRequest(
                                                putObjectRequest));

                return response(
                        200,
                        mapper.writeValueAsString(
                                Map.of(
                                        "uploadUrl",
                                        presignedRequest.url().toString(),
                                        "fileName",
                                        fileName
                                )
                        )
                );
            }

        } catch (IllegalArgumentException e) {

            try {
                return response(
                        400,
                        mapper.writeValueAsString(Map.of("message", e.getMessage()))
                );
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
                    "ERROR: " + e.getMessage());

            try {
                return response(
                        500,
                        mapper.writeValueAsString(
                                Map.of("message", "アップロードURLを発行できませんでした")
                        )
                );
            } catch (Exception serializationError) {
                throw new RuntimeException(serializationError);
            }
        }
    }

    private Map<String, Object> getProcessingStatus(Map<String, Object> input) throws Exception {
        Object rawQuery = input.get("queryStringParameters");
        if (!(rawQuery instanceof Map<?, ?> query)) {
            throw new IllegalArgumentException("jobIdが必要です");
        }

        Object rawJobId = query.get("jobId");
        String jobId = rawJobId == null ? "" : rawJobId.toString();
        if (!jobId.matches("schedule-\\d+\\.jpg")) {
            throw new IllegalArgumentException("jobIdの形式が正しくありません");
        }

        GetObjectTaggingResponse tagging;
        try (S3Client s3 = S3Client.builder().region(Region.AP_NORTHEAST_1).build()) {
            tagging = s3.getObjectTagging(
                    GetObjectTaggingRequest.builder()
                            .bucket("basket-schedule-app-images-002")
                            .key(jobId)
                            .build()
            );
        } catch (S3Exception e) {
            if (e.statusCode() == 403) {
                return response(200, mapper.writeValueAsString(Map.of(
                        "jobId", jobId,
                        "status", "UNAVAILABLE",
                        "message", "処理状況を取得できません。管理者に確認してください"
                )));
            }
            if (e.statusCode() == 404) {
                return response(200, mapper.writeValueAsString(Map.of(
                        "jobId", jobId,
                        "status", "FAILED",
                        "stage", "FAILED",
                        "message", "画像がS3に見つかりません。もう一度アップロードしてください"
                )));
            }
            throw e;
        }

        Map<String, String> tags = new java.util.HashMap<>();
        for (Tag tag : tagging.tagSet()) {
            tags.put(tag.key(), tag.value());
        }

        Map<String, Object> result = new java.util.HashMap<>();
        result.put("jobId", jobId);
        result.put("status", tags.getOrDefault("jobStatus", "QUEUED"));
        result.put("stage", tags.getOrDefault("jobStage", "WAITING"));
        result.put("completed", parseCount(tags.get("jobCompleted")));
        result.put("total", parseCount(tags.get("jobTotal")));
        return response(200, mapper.writeValueAsString(result));
    }

    private int parseCount(String value) {
        try {
            return Integer.parseInt(value);
        } catch (Exception ignored) {
            return 0;
        }
    }

    private String requestedContentType(Map<String, Object> input) throws Exception {
        Object rawBody = input.get("body");
        if (rawBody != null) {
            var body = mapper.readTree(rawBody.toString());
            String type = body.path("contentType").asText("image/jpeg");
            if ("image/jpeg".equals(type) || "image/png".equals(type) || "image/webp".equals(type)) {
                return type;
            }
        }
        return "image/jpeg";
    }

    @SuppressWarnings("unchecked")
    private String httpMethod(Map<String, Object> input) {
        Object rawContext = input.get("requestContext");
        if (rawContext instanceof Map<?, ?> requestContext) {
            Object rawHttp = requestContext.get("http");
            if (rawHttp instanceof Map<?, ?> http) {
                Object method = http.get("method");
                if (method != null) {
                    return method.toString();
                }
            }
        }
        Object method = input.get("httpMethod");
        return method == null ? "POST" : method.toString();
    }

    private Map<String, Object> response(int statusCode, String body) {
        return Map.of(
                "statusCode", statusCode,
                "headers", Map.of("Content-Type", "application/json; charset=UTF-8"),
                "body", body
        );
    }
}
