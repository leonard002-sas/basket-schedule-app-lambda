package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Lambdaイベントのバージョン差を吸収するHTTP情報解析を検証します。 */
class LambdaRequestParserTest {

  @Test
  void readsHttpMethodFromFunctionUrlEvent() {
    Map<String, Object> event = Map.of("requestContext", Map.of("http", Map.of("method", "PATCH")));

    assertEquals("PATCH", LambdaRequestParser.httpMethod(event));
  }

  @Test
  void readsHttpMethodFromApiGatewayV1EventAndDefaultsToGet() {
    Map<String, Object> versionOneEvent = Map.of("requestContext", Map.of("httpMethod", "DELETE"));

    assertEquals("DELETE", LambdaRequestParser.httpMethod(versionOneEvent));
    assertEquals("GET", LambdaRequestParser.httpMethod(Map.of()));
  }

  @Test
  void readsQueryParametersAsStringsWithoutLosingNullValues() {
    Map<String, Object> parameters = new HashMap<>();
    parameters.put("scheduleMonth", "2026-10");
    parameters.put("optional", null);
    Map<String, Object> event = Map.of("queryStringParameters", parameters);

    Map<String, String> actual = LambdaRequestParser.queryParameters(event);

    assertEquals("2026-10", actual.get("scheduleMonth"));
    assertNull(actual.get("optional"));
    assertEquals(2, actual.size());
    assertEquals(Map.of(), LambdaRequestParser.queryParameters(Map.of()));
  }

  @Test
  void readsBodyAndTreatsMissingBodyAsEmpty() {
    assertEquals("{\"ok\":true}", LambdaRequestParser.body(Map.of("body", "{\"ok\":true}")));
    assertEquals("", LambdaRequestParser.body(Map.of()));
  }
}
