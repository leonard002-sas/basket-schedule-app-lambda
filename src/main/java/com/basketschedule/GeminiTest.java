package com.basketschedule;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.google.genai.Client;
import com.google.genai.types.Content;
import com.google.genai.types.GenerateContentConfig;
import com.google.genai.types.GenerateContentResponse;
import com.google.genai.types.Part;
import com.google.genai.types.Schema;

public class GeminiTest {

	public static void main(String[] args) throws Exception {

		String apiKey = System.getenv("GEMINI_API_KEY");

		Path imagePath = Path.of(
				"src/main/resources/calendar.jpg");

		try (Client client = Client.builder()
				.apiKey(apiKey)
				.build()) {

			byte[] imageData = Files.readAllBytes(imagePath);

			Content content = Content.fromParts(
					Part.fromText("""
							「GeminiTest」と返却してください
							"""),

					Part.fromBytes(imageData, "image/jpeg"));

			GenerateContentConfig config = GenerateContentConfig.builder()
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

			System.out.println("Gemini API呼び出し開始");

			GenerateContentResponse response = client.models.generateContent(
					"gemini-3.6-flash",
					content,
					config);

			System.out.println("Gemini API呼び出し完了");

			String json = response.text();

			ObjectMapper mapper = new ObjectMapper();

			CalendarResponse calendarResponse = mapper.readValue(json, CalendarResponse.class);

			System.out.println("解析結果:");

			DynamoDbService dynamoDbService = new DynamoDbService();

			dynamoDbService.close();
		}
	}
}