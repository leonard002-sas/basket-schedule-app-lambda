package com.basketschedule;

import java.util.Objects;

/**
 * Lambda実行時の環境設定を一か所で管理します。
 *
 * <p>環境変数が設定されていないローカル開発では、現在の開発環境と同じ既定値を使います。 本番環境では、テーブル名やCognito情報をLambdaの環境変数から上書きできます。
 */
public final class ApplicationConfig {

  private static final String DEFAULT_REGION = "ap-northeast-1";
  private static final String DEFAULT_SCHEDULE_TABLE = "BasketSchedule";
  private static final String DEFAULT_FACILITY_TABLE = "BasketFacility";
  private static final String DEFAULT_BASKETBALL_TABLE = "BasketballData";
  private static final String DEFAULT_IMAGE_BUCKET = "basket-schedule-app-images-002";
  private static final String DEFAULT_USER_POOL_ID = "ap-northeast-1_Cd5fxLwj3";
  private static final String DEFAULT_COGNITO_CLIENT_ID = "3mr9ep2rosop9ratlg1l3bta70";

  private ApplicationConfig() {}

  /**
   * Returns the AWS region identifier.
   *
   * @return AWS region identifier
   */
  public static String region() {
    return value("AWS_REGION", DEFAULT_REGION);
  }

  /**
   * Returns the DynamoDB table used for schedules.
   *
   * @return DynamoDB table used for schedules
   */
  public static String scheduleTable() {
    return value("SCHEDULE_TABLE_NAME", DEFAULT_SCHEDULE_TABLE);
  }

  /**
   * Returns the DynamoDB table used for facilities.
   *
   * @return DynamoDB table used for facilities
   */
  public static String facilityTable() {
    return value("FACILITY_TABLE_NAME", DEFAULT_FACILITY_TABLE);
  }

  /**
   * Returns the DynamoDB table used for basketball data.
   *
   * @return DynamoDB table used for basketball data
   */
  public static String basketballTable() {
    return value("BASKETBALL_TABLE_NAME", DEFAULT_BASKETBALL_TABLE);
  }

  /**
   * Returns the S3 bucket used for schedule images.
   *
   * @return S3 bucket used for schedule images
   */
  public static String imageBucket() {
    return value("IMAGE_BUCKET_NAME", DEFAULT_IMAGE_BUCKET);
  }

  /**
   * Returns the Cognito user-pool ID.
   *
   * @return Cognito user-pool ID
   */
  public static String userPoolId() {
    return value("COGNITO_USER_POOL_ID", DEFAULT_USER_POOL_ID);
  }

  /**
   * Returns the Cognito app-client ID.
   *
   * @return Cognito app-client ID
   */
  public static String cognitoClientId() {
    return value("COGNITO_CLIENT_ID", DEFAULT_COGNITO_CLIENT_ID);
  }

  /**
   * Returns the Cognito token issuer URL.
   *
   * @return Cognito token issuer URL
   */
  public static String cognitoIssuer() {
    return "https://cognito-idp." + region() + ".amazonaws.com/" + userPoolId();
  }

  private static String value(String name, String defaultValue) {
    String configured = System.getenv(name);
    return configured == null || configured.isBlank()
        ? Objects.requireNonNull(defaultValue)
        : configured;
  }
}
