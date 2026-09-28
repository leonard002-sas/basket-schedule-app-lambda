package com.basketschedule;

import java.util.ArrayList;
import java.util.List;

/** 画像解析結果のJSON形式を表し、対象月と予定一覧を保持します。 */
public class CalendarResponse {

  private String scheduleMonth;

  private List<CalendarEntry> entries = new ArrayList<>();

  /** GeminiのJSON応答をJacksonが読み込めるよう、空の応答オブジェクトを作成します。 */
  public CalendarResponse() {}

  /**
   * 抽出した日付の年と月を判断するための対象月を返します。
   *
   * @return 通常は {@code yyyy-MM} 形式で表される対象月
   */
  public String getScheduleMonth() {

    return scheduleMonth;
  }

  /**
   * 画像解析で返された対象月を設定します。
   *
   * @param scheduleMonth {@code yyyy-MM} 形式で表す対象の年と月
   */
  public void setScheduleMonth(String scheduleMonth) {

    this.scheduleMonth = scheduleMonth;
  }

  /**
   * 抽出した日付と時間帯の組み合わせをすべて返します。
   *
   * @return 抽出した予定一覧。初期状態では空のリストです
   */
  public List<CalendarEntry> getEntries() {

    return entries;
  }

  /**
   * 抽出した日付と時間帯の組み合わせを設定します。
   *
   * @param entries 画像から抽出した予定一覧
   */
  public void setEntries(List<CalendarEntry> entries) {

    this.entries = entries;
  }
}
