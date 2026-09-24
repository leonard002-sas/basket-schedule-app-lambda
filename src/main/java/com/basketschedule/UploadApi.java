package com.basketschedule;

import java.time.Duration;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.ObjectMapper;

import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
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

            // S3バケット
            String bucketName =
                    "basket-schedule-app-images-002";

            // アップロードするファイル名
            String fileName =
                    "schedule-" + System.currentTimeMillis() + ".jpg";

            try (S3Presigner presigner =
                         S3Presigner.builder()
                                 .region(Region.AP_NORTHEAST_1)
                                 .build()) {

                PutObjectRequest putObjectRequest =
                        PutObjectRequest.builder()
                                .bucket(bucketName)
                                .key(fileName)
                                .contentType("image/jpeg")
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

    private Map<String, Object> response(int statusCode, String body) {
        return Map.of(
                "statusCode", statusCode,
                "headers", Map.of("Content-Type", "application/json; charset=UTF-8"),
                "body", body
        );
    }
}
