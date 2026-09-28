package com.basketschedule;

import java.util.List;
import java.util.Map;

/**
 * バスケットボールのボックススコア項目と、記録操作によるスタッツの増分を定義します。
 *
 * <p>このクラスはバスケットボールの集計ルールだけを扱います。AWSやHTTPリクエストに依存しないため、 外部サービスを使わずにルールをテストできます。
 */
public final class BasketballStatistics {

  private static final List<String> BOX_SCORE_FIELDS =
      List.of(
          "points",
          "FGM",
          "FGA",
          "2PM",
          "2PA",
          "3PM",
          "3PA",
          "FTM",
          "FTA",
          "OREB",
          "DREB",
          "REB",
          "AST",
          "STL",
          "BLK",
          "TO",
          "PF",
          "minutesSeconds");

  private BasketballStatistics() {
    // このクラスは集計ルールだけを持ち、インスタンス化しません。
  }

  /**
   * スコアブックの操作によって増加する項目と値を返します。
   *
   * @param actionType スコアブック画面から受け取る操作識別子
   * @return スタッツ項目名と増分の不変マップ
   * @throws IllegalArgumentException 未対応の操作識別子が指定された場合
   */
  public static Map<String, Long> deltaFor(String actionType) {
    return switch (actionType) {
      case "FG2_MADE" -> Map.of("points", 2L, "FGM", 1L, "FGA", 1L, "2PM", 1L, "2PA", 1L);
      case "FG2_MISS" -> Map.of("FGA", 1L, "2PA", 1L);
      case "FG3_MADE" -> Map.of("points", 3L, "FGM", 1L, "FGA", 1L, "3PM", 1L, "3PA", 1L);
      case "FG3_MISS" -> Map.of("FGA", 1L, "3PA", 1L);
      case "FT_MADE" -> Map.of("points", 1L, "FTM", 1L, "FTA", 1L);
      case "FT_MISS" -> Map.of("FTA", 1L);
      case "OREB" -> Map.of("OREB", 1L, "REB", 1L);
      case "DREB" -> Map.of("DREB", 1L, "REB", 1L);
      case "AST" -> Map.of("AST", 1L);
      case "STL" -> Map.of("STL", 1L);
      case "BLK" -> Map.of("BLK", 1L);
      case "TO" -> Map.of("TO", 1L);
      case "PF" -> Map.of("PF", 1L);
      default -> throw new IllegalArgumentException("未対応のスタッツ操作です: " + actionType);
    };
  }

  /**
   * 選手ごとのボックススコアに保存する項目一覧を返します。
   *
   * @return スタッツ項目名の不変リスト
   */
  public static List<String> boxScoreFields() {
    return BOX_SCORE_FIELDS;
  }
}
