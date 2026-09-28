package com.basketschedule;

import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

/**
 * Gemini画像解析APIを明示的に確認するための手動チェックです。Lambdaからは呼び出しません。 Gemini
 * APIの利用料金が発生する可能性があるため、実行時に明示的な確認を必須にします。
 */
public class GeminiImageExtractionSmokeCheck {

  /** mainメソッドから実行するため、このクラスのインスタンス生成を防ぎます。 */
  private GeminiImageExtractionSmokeCheck() {}

  /**
   * 確認フラグ、画像パス、APIキーを確認してGeminiに一度だけ問い合わせます。
   *
   * @param args {@code --confirm-paid-api-call} と解析対象画像のローカルパス
   * @throws Exception 画像を読み取れない場合、またはGemini APIが失敗した場合
   */
  public static void main(String[] args) throws Exception {
    String apiKey = System.getenv("GEMINI_API_KEY");
    if (args.length != 2 || !"--confirm-paid-api-call".equals(args[0])) {
      throw new IllegalArgumentException("料金が発生する場合があります。--confirm-paid-api-call と画像パスを指定してください。");
    }
    if (apiKey == null || apiKey.isBlank()) {
      throw new IllegalStateException("GEMINI_API_KEY が設定されていません。");
    }

    Path imagePath = Path.of(args[1]);

    try (Client client = Client.builder().apiKey(apiKey).build()) {

      byte[] imageData = Files.readAllBytes(imagePath);

      Content content =
          Content.fromParts(
              Part.fromText(
                  """
							「GeminiTest」と返却してください
							"""),
              Part.fromBytes(imageData, "image/jpeg"));

      GenerateContentConfig config =
          GenerateContentConfig.builder()
              .responseMimeType("application/json")
              .responseSchema(
                  Schema.builder()
                      .type("OBJECT")
                      .properties(
                          Map.of(
                              "entries",
                              Schema.builder()
                                  .type("ARRAY")
                                  .items(
                                      Schema.builder()
                                          .type("OBJECT")
                                          .properties(
                                              Map.of(
                                                  "date",
                                                  Schema.builder().type("STRING").build(),
                                                  "timeZone",
                                                  Schema.builder().type("STRING").build()))
                                          .build())
                                  .build()))
                      .build())
              .build();

      System.out.println("Gemini API呼び出し開始");

      GenerateContentResponse response =
          client.models.generateContent("gemini-3.6-flash", content, config);

      System.out.println("Gemini API呼び出し完了");

      System.out.println(response.text());
    }
  }
}
