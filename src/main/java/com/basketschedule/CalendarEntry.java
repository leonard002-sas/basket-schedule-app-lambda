package com.basketschedule;

/** 画像解析モデルが返した日付と時間帯の組み合わせを表します。 */
public class CalendarEntry {

  private String date;

  private String timeZone;

  /** GeminiのJSON応答をJacksonが読み込めるよう、空の予定項目を作成します。 */
  public CalendarEntry() {}

  /**
   * 元画像から読み取った日付の文字列を返します。
   *
   * @return {@code 7月12日} のような日付文字列
   */
  public String getDate() {
    return date;
  }

  /**
   * 元画像から読み取った日付の文字列を設定します。
   *
   * @param date {@code 7月12日} のような日付文字列
   */
  public void setDate(String date) {
    this.date = date;
  }

  /**
   * 元画像から読み取った時間帯の文字列を返します。
   *
   * @return {@code 午前}、{@code 午後}、{@code 夜間} などの時間帯
   */
  public String getTimeZone() {
    return timeZone;
  }

  /**
   * 元画像から読み取った時間帯の文字列を設定します。
   *
   * @param timeZone 予定の時間帯を表す日本語ラベル
   */
  public void setTimeZone(String timeZone) {
    this.timeZone = timeZone;
  }
}
