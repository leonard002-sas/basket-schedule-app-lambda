package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

/** よくある日本語の予定表セルがチームの標準時間へ変換されることを確認します。 */
class CalendarConverterTest {

  @Test
  void convertsMorningAndEveningEntries() {
    CalendarEvent morning = CalendarConverter.convert(entry("10日", "午前"), "2026-09");
    CalendarEvent thursdayEvening = CalendarConverter.convert(entry("10日", "夜間"), "2026-09");
    CalendarEvent fridayEvening = CalendarConverter.convert(entry("11日", "夜間"), "2026-09");

    assertEquals(LocalDateTime.of(2026, 9, 10, 9, 0), morning.getStart());
    assertEquals(LocalDateTime.of(2026, 9, 10, 12, 0), morning.getEnd());
    assertEquals(LocalDateTime.of(2026, 9, 10, 18, 30), thursdayEvening.getStart());
    assertEquals(LocalDateTime.of(2026, 9, 11, 18, 0), fridayEvening.getStart());
  }

  @Test
  void rejectsIncompleteOrAmbiguousScheduleInput() {
    assertThrows(
        IllegalArgumentException.class,
        () -> CalendarConverter.convert(entry("10日", "午前"), "2026-09 note"));
    assertThrows(
        IllegalArgumentException.class,
        () -> CalendarConverter.convert(entry("10日", "深夜"), "2026-09"));
    assertThrows(
        IllegalArgumentException.class,
        () -> CalendarConverter.convert(entry("32日", "午前"), "2026-09"));
  }

  private static CalendarEntry entry(String date, String timeZone) {
    CalendarEntry entry = new CalendarEntry();
    entry.setDate(date);
    entry.setTimeZone(timeZone);
    return entry;
  }
}
