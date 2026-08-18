package com.basketschedule;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public class CalendarConverter {

	public static CalendarEvent convert(
			CalendarEntry entry,
			String scheduleMonth) {

		String dateText = entry.getDate();
		String timeZone = entry.getTimeZone();

		if (scheduleMonth == null || scheduleMonth.isBlank()) {
			throw new IllegalArgumentException(
					"対象月が取得できません");
		}

		// 「2026-08」を抽出
		java.util.regex.Matcher yearMonthMatcher = java.util.regex.Pattern
				.compile("(\\d{4})-(\\d{1,2})")
				.matcher(scheduleMonth);

		if (!yearMonthMatcher.find()) {

			throw new IllegalArgumentException(
					"対象月を解析できません: "
							+ scheduleMonth);
		}

		int year = Integer.parseInt(
				yearMonthMatcher.group(1));

		int month = Integer.parseInt(
				yearMonthMatcher.group(2));

		int day;

		// 「8月5日」
		if (dateText.contains("月")) {

			java.util.regex.Matcher matcher = java.util.regex.Pattern
					.compile("(\\d+)月(\\d+)日")
					.matcher(dateText);

			if (!matcher.find()) {
				throw new IllegalArgumentException(
						"日付を解析できません: "
								+ dateText);
			}

			// 月はscheduleMonthを優先
			day = Integer.parseInt(
					matcher.group(2));

		} else {

			// 「5日」
			java.util.regex.Matcher matcher = java.util.regex.Pattern
					.compile("(\\d+)日")
					.matcher(dateText);

			if (!matcher.find()) {
				throw new IllegalArgumentException(
						"日付を解析できません: "
								+ dateText);
			}

			day = Integer.parseInt(
					matcher.group(1));
		}

		LocalDate date = LocalDate.of(
				year,
				month,
				day);

		LocalTime startTime;
		LocalTime endTime;

		switch (timeZone) {

		case "午前":
			startTime = LocalTime.of(9, 0);
			endTime = LocalTime.of(12, 0);
			break;

		case "午後":
			startTime = LocalTime.of(13, 0);
			endTime = LocalTime.of(17, 0);
			break;

		case "夜間":

			// 木曜日は18:30開始
			if (date.getDayOfWeek() == java.time.DayOfWeek.THURSDAY) {

				startTime = LocalTime.of(18, 30);

			} else {

				startTime = LocalTime.of(18, 0);
			}

			endTime = LocalTime.of(21, 0);

			break;

		default:
			throw new IllegalArgumentException(
					"不明な時間帯: "
							+ timeZone);
		}

		return new CalendarEvent(
				LocalDateTime.of(
						date,
						startTime),
				LocalDateTime.of(
						date,
						endTime));
	}
}