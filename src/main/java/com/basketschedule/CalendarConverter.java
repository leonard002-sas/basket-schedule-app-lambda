package com.basketschedule;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

public class CalendarConverter {

    public static CalendarEvent convert(CalendarEntry entry) {

    	String dateText = entry.getDate();
    	String timeZone = entry.getTimeZone();

    	int month;
    	int day;

    	if (dateText.contains("月")) {

    	    // 「9月5日」
    	    java.util.regex.Matcher matcher =
    	            java.util.regex.Pattern
    	                    .compile("(\\d+)月(\\d+)日")
    	                    .matcher(dateText);

    	    if (!matcher.find()) {
    	        throw new IllegalArgumentException(
    	                "日付を解析できません: " + dateText
    	        );
    	    }

    	    month = Integer.parseInt(matcher.group(1));
    	    day = Integer.parseInt(matcher.group(2));

    	} else {

    	    // 「5日」
    	    java.util.regex.Matcher matcher =
    	            java.util.regex.Pattern
    	                    .compile("(\\d+)日")
    	                    .matcher(dateText);

    	    if (!matcher.find()) {
    	        throw new IllegalArgumentException(
    	                "日付を解析できません: " + dateText
    	        );
    	    }

    	    month = 9;
    	    day = Integer.parseInt(matcher.group(1));
    	}

    	LocalDate date = LocalDate.of(2026, month, day);

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
                startTime = LocalTime.of(18, 0);
                endTime = LocalTime.of(21, 0);
                break;

            default:
                throw new IllegalArgumentException(
                        "不明な時間帯: " + timeZone
                );
        }

        return new CalendarEvent(
                LocalDateTime.of(date, startTime),
                LocalDateTime.of(date, endTime)
        );
    }
}