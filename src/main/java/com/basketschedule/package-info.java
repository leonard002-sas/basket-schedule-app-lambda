/**
 * Flight Penguins Official Site の Lambda ハンドラーとデータモデルをまとめます。
 *
 * <p>ハンドラーはLambda Function URLからAPI Gateway形式のイベントを受け取り、 {@link com.basketschedule.CognitoAuth}
 * でCognitoトークンを検証してからDynamoDBやS3へアクセスします。 {@code static}
 * 以下の画面はCloudFrontから配信され、同じCognitoユーザープールで認証します。
 */
package com.basketschedule;
