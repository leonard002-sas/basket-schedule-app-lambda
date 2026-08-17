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
							この画像は学校開放日程表です。

							画像を視覚的に解析してください。

							「10」と記載されているセルをすべて探してください。

							「10」が記載されているセルについて、
							以下の情報を特定してください。

							・日付
							・施設
							・時間帯

							時間帯は「午前」「午後」「夜間」のいずれかです。

							画像から確認できない情報を推測で追加しないでください。
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

			GenerateContentResponse response = client.models.generateContent(
					"gemini-3.6-flash",
					content,
					config);

			String json = response.text();

			ObjectMapper mapper = new ObjectMapper();

			CalendarResponse calendarResponse =
			        mapper.readValue(json, CalendarResponse.class);

			System.out.println("解析結果:");

			for (CalendarEntry entry : calendarResponse.getEntries()) {

			    System.out.println(
			            "日付: " + entry.getDate()
			            + " / 時間帯: " + entry.getTimeZone()
			    );
			}
		}
	}
}