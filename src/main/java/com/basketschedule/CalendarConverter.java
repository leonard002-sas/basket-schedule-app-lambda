package com.basketschedule;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 紙の予定表から読み取った日付と時間帯を、予定の開始・終了日時へ変換します。 */
public class CalendarConverter {

  private static final Pattern YEAR_MONTH_PATTERN = Pattern.compile("(\\d{4})-(\\d{1,2})");
  private static final Pattern JAPANESE_MONTH_DATE_PATTERN = Pattern.compile("(\\d+)月(\\d+)日");
  private static final Pattern JAPANESE_DAY_PATTERN = Pattern.compile("(\\d+)日");

  /** すべての処理がstaticメソッドのため、このクラスのインスタンス化を防ぎます。 */
  private CalendarConverter() {}

  /**
   * 対象月の中で予定の日付を確定し、チームで決めた標準時間を適用します。 木曜夜の練習は18時30分開始、それ以外の夜間予定は18時開始です。
   *
   * @param entry 画像から抽出した日付と日本語の時間帯
   * @param scheduleMonth 年と月を表す対象月
   * @return 予定の開始日時と終了日時
   * @throws IllegalArgumentException 月、日付、時間帯を読み取れない場合
   */
  public static CalendarEvent convert(CalendarEntry entry, String scheduleMonth) {

    if (entry == null) {
      throw new IllegalArgumentException("予定データがありません");
    }
    String dateText = entry.getDate();
    String timeZone = entry.getTimeZone();

    if (scheduleMonth == null || scheduleMonth.isBlank()) {
      throw new IllegalArgumentException("対象月が取得できません");
    }

    // 「2026-08」を抽出
    Matcher yearMonthMatcher = YEAR_MONTH_PATTERN.matcher(scheduleMonth.trim());

    if (!yearMonthMatcher.matches()) {

      throw new IllegalArgumentException("対象月を解析できません: " + scheduleMonth);
    }

    int year = Integer.parseInt(yearMonthMatcher.group(1));

    int month = Integer.parseInt(yearMonthMatcher.group(2));

    if (dateText == null || dateText.isBlank()) {
      throw new IllegalArgumentException("日付を解析できません");
    }
    if (timeZone == null || timeZone.isBlank()) {
      throw new IllegalArgumentException("時間帯を選択してください");
    }

    int day;

    // 「8月5日」
    if (dateText.contains("月")) {

      Matcher matcher = JAPANESE_MONTH_DATE_PATTERN.matcher(dateText);

      if (!matcher.matches()) {
        throw new IllegalArgumentException("日付を解析できません: " + dateText);
      }

      // 月はscheduleMonthを優先
      day = Integer.parseInt(matcher.group(2));

    } else {

      // 「5日」
      Matcher matcher = JAPANESE_DAY_PATTERN.matcher(dateText);

      if (!matcher.matches()) {
        throw new IllegalArgumentException("日付を解析できません: " + dateText);
      }

      day = Integer.parseInt(matcher.group(1));
    }

    LocalDate date;
    try {
      date = LocalDate.of(year, month, day);
    } catch (DateTimeException error) {
      throw new IllegalArgumentException("日付を解析できません: " + dateText, error);
    }

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
        throw new IllegalArgumentException("不明な時間帯: " + timeZone);
    }

    return new CalendarEvent(LocalDateTime.of(date, startTime), LocalDateTime.of(date, endTime));
  }
}
