package com.basketschedule;

import java.util.HashMap;
import java.util.Map;

/**
 * Lambda Function URLとAPI GatewayのイベントからHTTP情報を取り出します。
 *
 * <p>イベントの形式差をここで吸収し、各APIの処理からイベント構造の判定を分離します。
 */
final class LambdaRequestParser {

  private LambdaRequestParser() {}

  /**
   * イベントからHTTPメソッドを読み取ります。
   *
   * @param event Lambda Function URLまたはAPI Gatewayのイベント
   * @return HTTPメソッド。イベントに情報がなければGET
   */
  static String httpMethod(Map<String, Object> event) {
    Object rawContext = event.get("requestContext");
    if (!(rawContext instanceof Map<?, ?> context)) {
      return "GET";
    }

    Object rawHttp = context.get("http");
    if (rawHttp instanceof Map<?, ?> http) {
      Object method = http.get("method");
      if (method != null) {
        return method.toString();
      }
    }

    Object legacyMethod = context.get("httpMethod");
    return legacyMethod == null ? "GET" : legacyMethod.toString();
  }

  /**
   * イベントからクエリパラメーターを文字列のマップとして読み取ります。
   *
   * @param event Lambda Function URLまたはAPI Gatewayのイベント
   * @return クエリ名と値のマップ。指定がなければ空のマップ
   */
  static Map<String, String> queryParameters(Map<String, Object> event) {
    Object rawParameters = event.get("queryStringParameters");
    if (!(rawParameters instanceof Map<?, ?> parameters)) {
      return Map.of();
    }

    Map<String, String> result = new HashMap<>();
    parameters.forEach(
        (key, value) ->
            result.put(String.valueOf(key), value == null ? null : String.valueOf(value)));
    return result;
  }

  /**
   * イベント本文を文字列で読み取ります。
   *
   * @param event Lambda Function URLまたはAPI Gatewayのイベント
   * @return リクエスト本文。本文がない場合は空文字列
   */
  static String body(Map<String, Object> event) {
    Object body = event.get("body");
    return body == null ? "" : body.toString();
  }
}
