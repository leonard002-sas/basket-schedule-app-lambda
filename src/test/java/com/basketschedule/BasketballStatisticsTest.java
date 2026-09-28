package com.basketschedule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.Map;
import org.junit.jupiter.api.Test;

/** AWSに接続せずにスコアブックの集計ルールを確認します。 */
class BasketballStatisticsTest {

  @Test
  void recordsMadeAndMissedShotsWithTheCorrectCounters() {
    assertEquals(
        Map.of("points", 2L, "FGM", 1L, "FGA", 1L, "2PM", 1L, "2PA", 1L),
        BasketballStatistics.deltaFor("FG2_MADE"));
    assertEquals(Map.of("FGA", 1L, "3PA", 1L), BasketballStatistics.deltaFor("FG3_MISS"));
    assertEquals(
        Map.of("points", 1L, "FTM", 1L, "FTA", 1L), BasketballStatistics.deltaFor("FT_MADE"));
  }

  @Test
  void countsReboundsInBothTheirSpecificFieldAndTotalRebounds() {
    assertEquals(Map.of("OREB", 1L, "REB", 1L), BasketballStatistics.deltaFor("OREB"));
    assertEquals(Map.of("DREB", 1L, "REB", 1L), BasketballStatistics.deltaFor("DREB"));
  }

  @Test
  void rejectsUnknownScorebookActions() {
    assertThrows(IllegalArgumentException.class, () -> BasketballStatistics.deltaFor("UNKNOWN"));
  }
}
