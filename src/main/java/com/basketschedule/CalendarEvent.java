package com.basketschedule;

import java.time.LocalDateTime;

/** 変換後の予定を、地域時間の開始日時と終了日時で表します。 */
public class CalendarEvent {

  private LocalDateTime start;
  private LocalDateTime end;

  /**
   * 日付と時間帯を検証した後の予定時間を作成します。
   *
   * @param start チームの地域時間で表した予定の開始日時
   * @param end チームの地域時間で表した予定の終了日時
   */
  public CalendarEvent(LocalDateTime start, LocalDateTime end) {
    this.start = start;
    this.end = end;
  }

  /**
   * 予定の開始日時を返します。
   *
   * @return 予定の開始日時
   */
  public LocalDateTime getStart() {
    return start;
  }

  /**
   * 予定の終了日時を返します。
   *
   * @return 予定の終了日時
   */
  public LocalDateTime getEnd() {
    return end;
  }
}
