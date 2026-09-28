package com.basketschedule;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.dynamodb.DynamoDbClient;
import software.amazon.awssdk.services.dynamodb.model.AttributeValue;
import software.amazon.awssdk.services.dynamodb.model.DeleteItemRequest;
import software.amazon.awssdk.services.dynamodb.model.GetItemRequest;
import software.amazon.awssdk.services.dynamodb.model.Put;
import software.amazon.awssdk.services.dynamodb.model.PutItemRequest;
import software.amazon.awssdk.services.dynamodb.model.QueryRequest;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItem;
import software.amazon.awssdk.services.dynamodb.model.TransactWriteItemsRequest;
import software.amazon.awssdk.services.dynamodb.model.Update;
import software.amazon.awssdk.services.dynamodb.model.UpdateItemRequest;

/** バスケットボールのチーム、選手、試合、スタッツを扱う API です。 */
public class BasketballApi implements RequestHandler<Map<String, Object>, Map<String, Object>> {

  /** Lambda が API ハンドラーを作成するときに使うコンストラクターです。 */
  public BasketballApi() {}

  private static final String TABLE = "BasketballData";
  private static final String TEAM_INDEX_PK = "BASKETBALL";
  private static final ObjectMapper JSON = new ObjectMapper();
  private final DynamoDbClient db = DynamoDbClient.builder().region(Region.AP_NORTHEAST_1).build();

  @Override
  public Map<String, Object> handleRequest(Map<String, Object> input, Context context) {
    try {
      String method = method(input);
      Map<String, String> query = query(input);
      String resource = query.getOrDefault("resource", "");
      boolean write = !"GET".equalsIgnoreCase(method);
      if (write) CognitoAuth.requireAdmin(input);
      else CognitoAuth.requireUser(input);
      JsonNode body =
          input.get("body") == null
              ? JSON.createObjectNode()
              : JSON.readTree(input.get("body").toString());
      Object result =
          switch (method.toUpperCase()) {
            case "GET" -> read(resource, query);
            case "PUT" -> write(resource, body, query);
            case "DELETE" -> delete(resource, query);
            default -> throw new ApiException(405, "METHOD_NOT_ALLOWED", "この操作には対応していません");
          };
      return response(200, result);
    } catch (CognitoAuth.AuthException e) {
      return response(e.statusCode(), Map.of("message", e.getMessage(), "code", e.code()));
    } catch (ApiException e) {
      return response(e.status, Map.of("message", e.getMessage(), "code", e.code));
    } catch (IllegalArgumentException e) {
      return response(400, Map.of("message", e.getMessage()));
    } catch (Exception e) {
      StringBuilder details =
          new StringBuilder("Basketball API error [")
              .append(method(input))
              .append(" ")
              .append(query(input).getOrDefault("resource", ""))
              .append("]: ")
              .append(e.getClass().getName())
              .append(": ")
              .append(e.getMessage());
      for (StackTraceElement frame : e.getStackTrace()) details.append("\n  at ").append(frame);
      context.getLogger().log(details.toString());
      return response(500, Map.of("message", "スコア情報を保存できませんでした", "code", "INTERNAL_ERROR"));
    }
  }

  private Object read(String resource, Map<String, String> q) {
    return switch (resource) {
      case "teams" -> teams();
      case "team" -> plain(item(teamPk(required(q, "teamId")), "PROFILE"));
      case "team-data" -> teamData(required(q, "teamId"));
      case "players" -> plainList(rows(teamPk(required(q, "teamId")), "PLAYER#"));
      case "games" -> plainList(rows(teamPk(required(q, "teamId")), "GAME#"));
      case "game" -> game(q.get("gameId"));
      case "leaderboard" ->
          plainList(rows(seasonPk(q.get("season"), required(q, "teamId")), "PLAYER#"));
      case "player-trend" ->
          playerTrend(required(q, "teamId"), required(q, "playerId"), season(q.get("season")));
      default -> throw new ApiException(404, "NOT_FOUND", "指定された情報がありません");
    };
  }

  private Object teams() {
    List<Map<String, AttributeValue>> registered = new ArrayList<>(rows(TEAM_INDEX_PK, "TEAM#"));
    Map<String, AttributeValue> legacy = item("TEAM#MAIN", "PROFILE");
    if (!legacy.isEmpty() && registered.stream().noneMatch(t -> "MAIN".equals(str(t, "teamId")))) {
      Map<String, AttributeValue> migrated = new HashMap<>(legacy);
      migrated.put("teamId", s("MAIN"));
      migrated.put("name", s(str(legacy, "name")));
      registered.add(migrated);
    }
    return plainList(registered);
  }

  private Map<String, Object> teamData(String teamId) {
    return Map.of(
        "team",
        plain(item(teamPk(teamId), "PROFILE")),
        "players",
        plainList(rows(teamPk(teamId), "PLAYER#")));
  }

  private Map<String, Object> playerTrend(String teamId, String playerId, String year) {
    List<Map<String, AttributeValue>> completed =
        rows(teamPk(teamId), "GAME#").stream()
            .filter(row -> "FINAL".equals(str(row, "status")) && str(row, "date").startsWith(year))
            .sorted((a, b) -> str(b, "date").compareTo(str(a, "date")))
            .limit(20)
            .toList();
    if (completed.isEmpty()) return Map.of("items", List.of());
    List<Map<String, Object>> out = new ArrayList<>();
    for (var game : completed) {
      String id = str(game, "gameId");
      var stat = item("GAME#" + id, "PLAYER#" + playerId);
      Map<String, Object> row = new HashMap<>();
      row.put("gameId", id);
      row.put("date", str(game, "date"));
      row.put("opponent", str(game, "opponent"));
      row.put("result", str(game, "result"));
      row.put(
          "participation",
          stat.isEmpty() || "DNP".equals(str(stat, "participation")) ? "DNP" : "PLAYED");
      row.put("points", longValue(stat, "points", 0));
      row.put("REB", longValue(stat, "REB", 0));
      row.put("AST", longValue(stat, "AST", 0));
      row.put("minutesSeconds", longValue(stat, "minutesSeconds", 0));
      out.add(row);
    }
    return Map.of("items", out);
  }

  private Object write(String resource, JsonNode b, Map<String, String> query) {
    return switch (resource) {
      case "team" -> saveTeam(b);
      case "player" -> savePlayer(b, required(query, "teamId"));
      case "game" ->
          b.path("gameId").asText("").isBlank()
              ? createGame(b, required(query, "teamId"))
              : updateGame(b, required(query, "teamId"));
      case "import-game" -> importGame(b, required(query, "teamId"));
      case "action" -> recordAction(b);
      case "undo" -> undoAction(b);
      case "clock" -> updateClock(b);
      case "lineup" -> updateLineup(b);
      case "finish" -> finishGame(b);
      default -> throw new ApiException(404, "NOT_FOUND", "指定された操作がありません");
    };
  }

  private Object delete(String resource, Map<String, String> query) {
    return switch (resource) {
      case "player" -> deactivatePlayer(required(query, "teamId"), required(query, "playerId"));
      case "team" -> deleteTeam(required(query, "teamId"));
      default -> throw new ApiException(404, "NOT_FOUND", "この削除操作には対応していません");
    };
  }

  private Map<String, Object> saveTeam(JsonNode b) {
    String name = required(b, "name");
    String id =
        b.path("teamId").asText("").isBlank()
            ? UUID.randomUUID().toString()
            : b.path("teamId").asText();
    Map<String, AttributeValue> item = key(teamPk(id), "PROFILE");
    item.put("teamId", s(id));
    item.put("name", s(name));
    item.put("updatedAt", s(Instant.now().toString()));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(item).build());
    Map<String, AttributeValue> index = key(TEAM_INDEX_PK, "TEAM#" + id);
    index.put("teamId", s(id));
    index.put("name", s(name));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(index).build());
    return Map.of("teamId", id, "name", name);
  }

  private Map<String, Object> savePlayer(JsonNode b, String teamId) {
    String id =
        b.path("playerId").asText("").isBlank()
            ? UUID.randomUUID().toString()
            : b.path("playerId").asText();
    String name = required(b, "name");
    String position = required(b, "position").toUpperCase(Locale.ROOT);
    if (!Set.of("PG", "SG", "SF", "PF", "C").contains(position))
      throw new IllegalArgumentException("ポジションは PG / SG / SF / PF / C から選択してください");
    int number = Math.max(0, b.path("number").asInt(0));
    Map<String, AttributeValue> item = key(teamPk(teamId), "PLAYER#" + id);
    item.put("playerId", s(id));
    item.put("name", s(name));
    item.put("number", n(number));
    item.put("position", s(position));
    item.put("active", AttributeValue.builder().bool(true).build());
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(item).build());
    return Map.of("playerId", id, "name", name, "number", number, "position", position);
  }

  private Map<String, Object> deactivatePlayer(String teamId, String playerId) {
    Map<String, AttributeValue> player = item(teamPk(teamId), "PLAYER#" + playerId);
    if (player.isEmpty()) throw new ApiException(404, "PLAYER_NOT_FOUND", "メンバーが見つかりません");
    set(teamPk(teamId), "PLAYER#" + playerId, Map.of("active", boolValue(false)));
    return Map.of("playerId", playerId, "active", false);
  }

  private Map<String, Object> deleteTeam(String teamId) {
    String pk = teamPk(teamId);
    if (item(pk, "PROFILE").isEmpty()) throw new ApiException(404, "TEAM_NOT_FOUND", "チームが見つかりません");
    List<Map<String, AttributeValue>> teamRows = allRows(pk);
    List<Map<String, AttributeValue>> teamGames =
        teamRows.stream().filter(row -> str(row, "sk").startsWith("GAME#")).toList();
    Set<String> seasons = new java.util.HashSet<>();
    for (var game : teamGames) {
      String id = str(game, "gameId");
      if (id.isBlank()) continue;
      String date = str(game, "date");
      if (date.length() >= 4) seasons.add(date.substring(0, 4));
      for (var child : allRows("GAME#" + id))
        db.deleteItem(
            DeleteItemRequest.builder()
                .tableName(TABLE)
                .key(key("GAME#" + id, str(child, "sk")))
                .build());
    }
    for (String year : seasons)
      for (var row : allRows(seasonPk(year, teamId)))
        if (str(row, "sk").startsWith("PLAYER#"))
          db.deleteItem(
              DeleteItemRequest.builder()
                  .tableName(TABLE)
                  .key(key(seasonPk(year, teamId), str(row, "sk")))
                  .build());
    for (var row : teamRows)
      db.deleteItem(
          DeleteItemRequest.builder().tableName(TABLE).key(key(pk, str(row, "sk"))).build());
    db.deleteItem(
        DeleteItemRequest.builder()
            .tableName(TABLE)
            .key(key(TEAM_INDEX_PK, "TEAM#" + teamId))
            .build());
    return Map.of("teamId", teamId, "deleted", true);
  }

  private Map<String, Object> createGame(JsonNode b, String teamId) {
    if (item(teamPk(teamId), "PROFILE").isEmpty())
      throw new ApiException(404, "TEAM_NOT_FOUND", "チームが見つかりません");
    String opponent = required(b, "opponent");
    String date = b.path("date").asText(LocalDate.now().toString());
    try {
      LocalDate.parse(date);
    } catch (Exception e) {
      throw new IllegalArgumentException("試合日を確認してください");
    }
    int quarterMinutes = b.path("quarterMinutes").asInt(10);
    if (quarterMinutes < 1 || quarterMinutes > 20)
      throw new IllegalArgumentException("クォーター時間は1〜20分で指定してください");
    String linkedMonth = b.path("scheduleMonth").asText("");
    String linkedStart = b.path("startDateTime").asText("");
    String competitionName = b.path("competitionName").asText("").trim();
    String round = b.path("round").asText("").trim();
    if (competitionName.length() > 80 || round.length() > 40)
      throw new IllegalArgumentException("大会名は80文字、ラウンドは40文字以内で入力してください");
    String teamPartition = teamPk(teamId);
    if (!linkedMonth.isBlank() && !linkedStart.isBlank())
      for (var existing : rows(teamPartition, "GAME#")) {
        if (linkedMonth.equals(str(existing, "scheduleMonth"))
            && linkedStart.equals(str(existing, "startDateTime")))
          throw new ApiException(409, "GAME_EXISTS", "この試合予定はすでにスコア記録へ登録されています");
      }
    String id = UUID.randomUUID().toString();
    long now = Instant.now().getEpochSecond();
    Map<String, AttributeValue> game = key(teamPartition, "GAME#" + date + "#" + id);
    game.put("gameId", s(id));
    game.put("date", s(date));
    game.put("opponent", s(opponent));
    game.put("quarterMinutes", n(quarterMinutes));
    game.put("status", s("READY"));
    game.put("period", n(1));
    game.put("remainingSeconds", n(quarterMinutes * 60));
    game.put("teamScore", n(0));
    game.put("opponentScore", n(0));
    game.put("createdAt", n(now));
    game.put("teamGameSk", s("GAME#" + date + "#" + id));
    game.put("teamId", s(teamId));
    List<String> rosterPlayerIds =
        rows(teamPartition, "PLAYER#").stream()
            .filter(player -> !player.containsKey("active") || bool(player, "active"))
            .map(
                player -> {
                  String rosterPlayerId = str(player, "playerId");
                  return rosterPlayerId.isBlank()
                      ? str(player, "sk").replaceFirst("^PLAYER#", "")
                      : rosterPlayerId;
                })
            .filter(rosterPlayerId -> !rosterPlayerId.isBlank())
            .toList();
    if (!rosterPlayerIds.isEmpty())
      game.put("rosterPlayerIds", AttributeValue.builder().ss(rosterPlayerIds).build());
    if (!linkedMonth.isBlank()) game.put("scheduleMonth", s(linkedMonth));
    if (!linkedStart.isBlank()) game.put("startDateTime", s(linkedStart));
    if (!competitionName.isBlank()) game.put("competitionName", s(competitionName));
    if (!round.isBlank()) game.put("round", s(round));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(game).build());
    Map<String, AttributeValue> meta = new HashMap<>(game);
    meta.put("pk", s("GAME#" + id));
    meta.put("sk", s("META"));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(meta).build());
    return Map.of("gameId", id, "date", date, "opponent", opponent, "status", "READY");
  }

  private Map<String, Object> updateGame(JsonNode b, String teamId) {
    String id = required(b, "gameId"), partition = teamPk(teamId);
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty()) throw new ApiException(404, "GAME_NOT_FOUND", "試合が見つかりません");
    if (!teamId.equals(str(meta, "teamId")))
      throw new ApiException(403, "TEAM_MISMATCH", "このチームの試合ではありません");
    String date = b.path("date").asText(str(meta, "date"));
    try {
      LocalDate.parse(date);
    } catch (Exception e) {
      throw new IllegalArgumentException("試合日を確認してください");
    }
    String opponent = required(b, "opponent");
    int quarter = b.path("quarterMinutes").asInt(integer(meta, "quarterMinutes", 10));
    if (quarter < 1 || quarter > 20) throw new IllegalArgumentException("クォーター時間は1〜20分で指定してください");
    boolean ready = "READY".equals(str(meta, "status"));
    if (!ready && quarter != integer(meta, "quarterMinutes", 10))
      throw new IllegalArgumentException("試合開始後はクォーター時間を変更できません");
    boolean finalGame = "FINAL".equals(str(meta, "status"));
    int oldOpponentScore = integer(meta, "opponentScore", 0), opponentScore = oldOpponentScore;
    String oldResult = str(meta, "result"), result = oldResult;
    if (finalGame && b.has("opponentScore") && !b.get("opponentScore").isNull()) {
      opponentScore = b.get("opponentScore").asInt(-1);
      if (opponentScore < 0) throw new IllegalArgumentException("相手得点は0以上で入力してください");
      int teamScore = integer(meta, "teamScore", 0);
      result = teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
    }
    String oldDate = str(meta, "date"),
        oldSk = str(meta, "teamGameSk"),
        newSk = "GAME#" + date + "#" + id;
    Map<String, AttributeValue> teamGame = item(partition, oldSk);
    if (teamGame.isEmpty()) throw new ApiException(404, "GAME_NOT_FOUND", "試合一覧のデータが見つかりません");
    Map<String, AttributeValue> updated = new HashMap<>(teamGame);
    updated.put("sk", s(newSk));
    updated.put("teamGameSk", s(newSk));
    updated.put("date", s(date));
    updated.put("opponent", s(opponent));
    updated.put("quarterMinutes", n(quarter));
    if (finalGame && b.has("opponentScore")) {
      updated.put("opponentScore", n(opponentScore));
      updated.put("result", s(result));
    }
    if (ready) updated.put("remainingSeconds", n(quarter * 60L));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(updated).build());
    Map<String, AttributeValue> changes = new HashMap<>();
    changes.put("date", s(date));
    changes.put("teamGameSk", s(newSk));
    changes.put("opponent", s(opponent));
    changes.put("quarterMinutes", n(quarter));
    if (finalGame && b.has("opponentScore")) {
      changes.put("opponentScore", n(opponentScore));
      changes.put("result", s(result));
    }
    if (ready) changes.put("remainingSeconds", n(quarter * 60L));
    set("GAME#" + id, "META", changes);
    if (!oldSk.equals(newSk))
      db.deleteItem(
          DeleteItemRequest.builder().tableName(TABLE).key(key(partition, oldSk)).build());
    if (finalGame && !oldDate.substring(0, 4).equals(date.substring(0, 4)))
      moveSeasonTotals(id, teamId, oldDate.substring(0, 4), date.substring(0, 4), oldResult);
    if (finalGame && !oldResult.equals(result))
      moveSeasonResult(id, teamId, date.substring(0, 4), oldResult, result);
    return Map.of(
        "gameId",
        id,
        "date",
        date,
        "opponent",
        opponent,
        "quarterMinutes",
        quarter,
        "status",
        str(meta, "status"));
  }

  private void moveSeasonTotals(
      String gameId, String teamId, String fromYear, String toYear, String result) {
    String from = seasonPk(fromYear, teamId), to = seasonPk(toYear, teamId);
    for (var row : rows("GAME#" + gameId, "PLAYER#")) {
      String playerId = str(row, "playerId");
      if (playerId.isBlank()) playerId = str(row, "sk").replaceFirst("^PLAYER#", "");
      Map<String, Long> totals = new HashMap<>();
      for (String f : STAT_FIELDS) totals.put(f, longValue(row, f, 0));
      totals.put("GP", 1L);
      totals.put("W", "W".equals(result) ? 1L : 0L);
      totals.put("L", "L".equals(result) ? 1L : 0L);
      totals.put("D", "D".equals(result) ? 1L : 0L);
      Map<String, Long> negative = new HashMap<>();
      totals.forEach((k, v) -> negative.put(k, -v));
      addStats(from, "PLAYER#" + playerId, negative);
      addStats(to, "PLAYER#" + playerId, totals);
    }
  }

  private void moveSeasonResult(
      String gameId, String teamId, String year, String fromResult, String toResult) {
    Map<String, Long> delta = new HashMap<>();
    if ("W".equals(fromResult)) delta.put("W", -1L);
    if ("L".equals(fromResult)) delta.put("L", -1L);
    if ("D".equals(fromResult)) delta.put("D", -1L);
    if ("W".equals(toResult)) delta.merge("W", 1L, Long::sum);
    if ("L".equals(toResult)) delta.merge("L", 1L, Long::sum);
    if ("D".equals(toResult)) delta.merge("D", 1L, Long::sum);
    if (delta.isEmpty()) return;
    String partition = seasonPk(year, teamId);
    for (var row : rows("GAME#" + gameId, "PLAYER#")) {
      String playerId = str(row, "playerId");
      if (playerId.isBlank()) playerId = str(row, "sk").replaceFirst("^PLAYER#", "");
      addStats(partition, "PLAYER#" + playerId, delta);
    }
  }

  private Map<String, Object> importGame(JsonNode b, String teamId) {
    String partition = teamPk(teamId);
    if (item(partition, "PROFILE").isEmpty())
      throw new ApiException(404, "TEAM_NOT_FOUND", "チームが見つかりません");
    String date = required(b, "date"), opponent = required(b, "opponent");
    try {
      LocalDate.parse(date);
    } catch (Exception e) {
      throw new IllegalArgumentException("試合日を確認してください");
    }
    JsonNode inputPlayers = b.path("players");
    if (!inputPlayers.isArray() || inputPlayers.isEmpty() || inputPlayers.size() > 100)
      throw new IllegalArgumentException("CSVに1〜100名分の選手スタッツが必要です");
    for (var existing : rows(partition, "GAME#"))
      if (bool(existing, "imported")
          && date.equals(str(existing, "date"))
          && opponent.equalsIgnoreCase(str(existing, "opponent")))
        throw new ApiException(409, "DUPLICATE_IMPORT", "同じ日付・対戦相手の過去試合はすでに取り込まれています");
    int opponentScore = b.path("opponentScore").asInt(-1), teamScore = 0;
    for (JsonNode p : inputPlayers)
      if (!"DNP".equalsIgnoreCase(p.path("participation").asText()))
        teamScore += importNumber(p.path("stats"), "PTS", "points");
    String result =
        opponentScore < 0
            ? "U"
            : teamScore > opponentScore ? "W" : teamScore < opponentScore ? "L" : "D";
    String id = UUID.randomUUID().toString();
    long now = Instant.now().getEpochSecond();
    Map<String, AttributeValue> game = key(partition, "GAME#" + date + "#" + id);
    game.put("gameId", s(id));
    game.put("teamId", s(teamId));
    game.put("date", s(date));
    game.put("opponent", s(opponent));
    game.put("teamGameSk", s("GAME#" + date + "#" + id));
    game.put("quarterMinutes", n(10));
    game.put("period", n(4));
    game.put("remainingSeconds", n(0));
    game.put("teamScore", n(teamScore));
    game.put("opponentScore", n(Math.max(opponentScore, 0)));
    game.put("status", s("FINAL"));
    game.put("result", s(result));
    game.put("imported", boolValue(true));
    game.put("createdAt", n(now));
    game.put("finishedAt", n(now));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(game).build());
    Map<String, AttributeValue> meta = new HashMap<>(game);
    meta.put("pk", s("GAME#" + id));
    meta.put("sk", s("META"));
    db.putItem(PutItemRequest.builder().tableName(TABLE).item(meta).build());
    Map<String, Map<String, AttributeValue>> rosterByName = new HashMap<>();
    for (var existing : rows(partition, "PLAYER#"))
      rosterByName.put(str(existing, "name").trim().toLowerCase(Locale.ROOT), existing);
    int imported = 0;
    for (JsonNode input : inputPlayers) {
      String name = input.path("name").asText("").trim();
      if (name.isBlank()) continue;
      Map<String, AttributeValue> player =
          rosterByName.getOrDefault(name.toLowerCase(Locale.ROOT), new HashMap<>());
      String playerId;
      if (player.isEmpty()) {
        playerId = UUID.randomUUID().toString();
        player = key(partition, "PLAYER#" + playerId);
        player.put("playerId", s(playerId));
        player.put("name", s(name));
        player.put("number", n(Math.max(0, input.path("number").asInt(0))));
        String pos = input.path("position").asText("").trim().toUpperCase(Locale.ROOT);
        if (Set.of("PG", "SG", "SF", "PF", "C").contains(pos)) player.put("position", s(pos));
        player.put("active", boolValue(true));
        db.putItem(PutItemRequest.builder().tableName(TABLE).item(player).build());
        rosterByName.put(name.toLowerCase(Locale.ROOT), player);
      } else {
        playerId = str(player, "playerId");
        if (playerId.isBlank()) playerId = str(player, "sk").replaceFirst("^PLAYER#", "");
        if (!bool(player, "active"))
          set(partition, "PLAYER#" + playerId, Map.of("active", boolValue(true)));
      }
      Map<String, AttributeValue> gameStats = key("GAME#" + id, "PLAYER#" + playerId);
      gameStats.put("playerId", s(playerId));
      gameStats.put("playerName", s(str(player, "name")));
      boolean didNotPlay = "DNP".equalsIgnoreCase(input.path("participation").asText());
      gameStats.put("participation", s(didNotPlay ? "DNP" : "PLAYED"));
      if (!str(player, "position").isBlank()) gameStats.put("position", s(str(player, "position")));
      Map<String, Long> totals = importStats(input.path("stats"));
      if (didNotPlay) totals.replaceAll((field, value) -> 0L);
      totals.forEach((field, value) -> gameStats.put(field, n(value)));
      db.putItem(PutItemRequest.builder().tableName(TABLE).item(gameStats).build());
      if (didNotPlay) {
        imported++;
        continue;
      }
      totals.put("GP", 1L);
      totals.put("W", "W".equals(result) ? 1L : 0L);
      totals.put("L", "L".equals(result) ? 1L : 0L);
      totals.put("D", "D".equals(result) ? 1L : 0L);
      addStats(seasonPk(date.substring(0, 4), teamId), "PLAYER#" + playerId, totals);
      imported++;
    }
    return Map.of(
        "gameId", id, "playersImported", imported, "teamScore", teamScore, "result", result);
  }

  private Map<String, Long> importStats(JsonNode stats) {
    Map<String, Long> values = new HashMap<>();
    values.put("points", (long) importNumber(stats, "PTS", "points"));
    for (String field :
        List.of(
            "FGM", "FGA", "2PM", "2PA", "3PM", "3PA", "FTM", "FTA", "OREB", "DREB", "AST", "STL",
            "BLK", "TO", "PF")) values.put(field, (long) importNumber(stats, field));
    int reb = importNumber(stats, "REB");
    if (reb == 0) reb = (int) (values.get("OREB") + values.get("DREB"));
    values.put("REB", (long) reb);
    return values;
  }

  private int importNumber(JsonNode node, String... fields) {
    for (String field : fields)
      if (node.has(field))
        try {
          return Math.max(0, node.get(field).asInt());
        } catch (Exception ignored) {
        }
    return 0;
  }

  private Object recordAction(JsonNode b) {
    String gameId = required(b, "gameId");
    String playerId = required(b, "playerId");
    String type = required(b, "type");
    Map<String, Long> delta = statDelta(type);
    Map<String, AttributeValue> meta = item("GAME#" + gameId, "META");
    if (meta.isEmpty() || "FINAL".equals(str(meta, "status")))
      throw new ApiException(409, "GAME_CLOSED", "この試合は記録を終了しています");
    String teamPartition = teamPk(str(meta, "teamId"));
    if (item(teamPartition, "PLAYER#" + playerId).isEmpty())
      throw new ApiException(404, "PLAYER_NOT_FOUND", "選手が見つかりません");
    long now = Instant.now().toEpochMilli();
    String eventId = UUID.randomUUID().toString();
    Map<String, AttributeValue> event =
        key("GAME#" + gameId, "EVENT#" + String.format("%013d", now) + "#" + eventId);
    event.put("eventId", s(eventId));
    event.put("playerId", s(playerId));
    event.put("type", s(type));
    event.put("period", n(integer(meta, "period", 1)));
    event.put("createdAt", n(now));
    List<TransactWriteItem> writes = new ArrayList<>();
    writes.add(
        TransactWriteItem.builder()
            .put(Put.builder().tableName(TABLE).item(event).build())
            .build());
    writes.add(
        TransactWriteItem.builder()
            .update(addUpdate("GAME#" + gameId, "PLAYER#" + playerId, delta, true))
            .build());
    long points = delta.getOrDefault("points", 0L);
    if (points != 0) {
      writes.add(
          TransactWriteItem.builder()
              .update(addUpdate("GAME#" + gameId, "META", Map.of("teamScore", points)))
              .build());
      Map<String, AttributeValue> gameRow = item(teamPartition, str(meta, "teamGameSk"));
      if (!gameRow.isEmpty())
        writes.add(
            TransactWriteItem.builder()
                .update(
                    addUpdate(teamPartition, str(meta, "teamGameSk"), Map.of("teamScore", points)))
                .build());
    }
    db.transactWriteItems(TransactWriteItemsRequest.builder().transactItems(writes).build());
    return Map.of("eventId", eventId, "type", type, "playerId", playerId);
  }

  private Object updateClock(JsonNode b) {
    String id = required(b, "gameId");
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty()) throw new ApiException(404, "GAME_NOT_FOUND", "試合が見つかりません");
    String command = required(b, "command");
    int period = integer(meta, "period", 1);
    int full = integer(meta, "quarterMinutes", 10) * 60;
    long remaining = integer(meta, "remainingSeconds", full);
    boolean running = bool(meta, "clockRunning");
    long now = Instant.now().getEpochSecond();
    if (running) {
      long elapsed = now - longValue(meta, "clockStartedAt", now);
      remaining = Math.max(0, remaining - elapsed);
      addCurrentLineupMinutes(id, meta, now);
    }
    switch (command) {
      case "start" -> {
        if ("FINAL".equals(str(meta, "status")))
          throw new ApiException(409, "GAME_CLOSED", "試合終了後は時計を動かせません");
        running = true;
      }
      case "pause" -> running = false;
      case "next" -> {
        running = false;
        period = Math.min(4, period + 1);
        remaining = full;
      }
      case "reset" -> {
        running = false;
        remaining = full;
      }
      default -> throw new IllegalArgumentException("時計操作が不正です");
    }
    if ("start".equals(command) && !str(meta, "onCourt").isBlank())
      for (String player : str(meta, "onCourt").split(","))
        set("GAME#" + id, "PLAYER#" + player, Map.of("participation", s("PLAYED")));
    Map<String, AttributeValue> clockChanges = new HashMap<>();
    clockChanges.put("period", n(period));
    clockChanges.put("remainingSeconds", n(remaining));
    clockChanges.put("clockRunning", boolValue(running));
    clockChanges.put("clockStartedAt", n(now));
    clockChanges.put("lineupStartedAt", n(now));
    clockChanges.put("status", s("LIVE"));
    setMeta(id, clockChanges);
    syncTeamGame(meta, id, period, remaining, running);
    return Map.of("period", period, "remainingSeconds", remaining, "clockRunning", running);
  }

  private Object undoAction(JsonNode b) {
    String id = required(b, "gameId");
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty() || "FINAL".equals(str(meta, "status")))
      throw new ApiException(409, "GAME_CLOSED", "終了した試合は変更できません");
    List<Map<String, AttributeValue>> events = rows("GAME#" + id, "EVENT#");
    if (events.isEmpty()) throw new ApiException(404, "NO_ACTIONS", "取り消す記録がありません");
    Map<String, AttributeValue> last = events.get(events.size() - 1);
    String player = str(last, "playerId");
    String type = str(last, "type");
    Map<String, Long> reverse = new HashMap<>();
    statDelta(type).forEach((k, v) -> reverse.put(k, -v));
    addStats("GAME#" + id, "PLAYER#" + player, reverse);
    long points = statDelta(type).getOrDefault("points", 0L);
    if (points != 0) {
      addStats("GAME#" + id, "META", Map.of("teamScore", -points));
      String teamGameSk = str(meta, "teamGameSk");
      if (!teamGameSk.isBlank())
        addStats(teamPk(str(meta, "teamId")), teamGameSk, Map.of("teamScore", -points));
    }
    db.deleteItem(
        DeleteItemRequest.builder()
            .tableName(TABLE)
            .key(key("GAME#" + id, str(last, "sk")))
            .build());
    boolean hasEarlierActionForPlayer =
        events.subList(0, events.size() - 1).stream()
            .anyMatch(event -> player.equals(str(event, "playerId")));
    Map<String, AttributeValue> playerStats = item("GAME#" + id, "PLAYER#" + player);
    boolean isOnCourt = List.of(str(meta, "onCourt").split(",")).contains(player);
    if (!hasEarlierActionForPlayer
        && !isOnCourt
        && longValue(playerStats, "minutesSeconds", 0) == 0)
      set("GAME#" + id, "PLAYER#" + player, Map.of("participation", s("DNP")));
    return Map.of("undone", type, "playerId", player);
  }

  private Object updateLineup(JsonNode b) {
    String id = required(b, "gameId");
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty() || "FINAL".equals(str(meta, "status")))
      throw new ApiException(409, "GAME_CLOSED", "この試合では交代を記録できません");
    List<String> next = new ArrayList<>();
    b.path("playerIds")
        .forEach(
            v -> {
              if (!v.asText().isBlank() && !next.contains(v.asText())) next.add(v.asText());
            });
    if (next.size() > 5) throw new IllegalArgumentException("コート上の選手は5人までです");
    String teamPartition = teamPk(str(meta, "teamId"));
    for (String player : next)
      if (item(teamPartition, "PLAYER#" + player).isEmpty())
        throw new ApiException(404, "PLAYER_NOT_FOUND", "登録されていない選手が含まれています");
    if (bool(meta, "clockRunning"))
      for (String player : next)
        set("GAME#" + id, "PLAYER#" + player, Map.of("participation", s("PLAYED")));
    long now = Instant.now().getEpochSecond();
    List<String> old =
        str(meta, "onCourt").isBlank() ? List.of() : List.of(str(meta, "onCourt").split(","));
    long since = longValue(meta, "lineupStartedAt", now);
    long elapsed =
        bool(meta, "clockRunning")
            ? Math.max(0, Math.min(now - since, integer(meta, "remainingSeconds", 0)))
            : 0;
    for (String player : old)
      if (elapsed > 0)
        addStats("GAME#" + id, "PLAYER#" + player, Map.of("minutesSeconds", elapsed));
    setMeta(
        id,
        Map.of(
            "onCourt", s(String.join(",", next)), "lineupStartedAt", n(now), "status", s("LIVE")));
    return Map.of("playerIds", next);
  }

  private Object finishGame(JsonNode b) {
    String id = required(b, "gameId");
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty()) throw new ApiException(404, "GAME_NOT_FOUND", "試合が見つかりません");
    if ("FINAL".equals(str(meta, "status")))
      throw new ApiException(409, "ALREADY_FINAL", "この試合は確定済みです");
    if (bool(meta, "clockRunning"))
      addCurrentLineupMinutes(id, meta, Instant.now().getEpochSecond());
    int opponentScore = Math.max(0, b.path("opponentScore").asInt(0));
    List<Map<String, AttributeValue>> players = rows("GAME#" + id, "PLAYER#");
    String result =
        integer(meta, "teamScore", 0) > opponentScore
            ? "W"
            : integer(meta, "teamScore", 0) < opponentScore ? "L" : "D";
    String season =
        str(meta, "date").length() >= 4
            ? str(meta, "date").substring(0, 4)
            : LocalDate.now().toString().substring(0, 4);
    for (Map<String, AttributeValue> p : players) {
      if ("DNP".equals(str(p, "participation"))) continue;
      String player = str(p, "sk").substring("PLAYER#".length());
      Map<String, Long> totals = new HashMap<>();
      for (String field : STAT_FIELDS) totals.put(field, longValue(p, field, 0));
      totals.put("GP", 1L);
      totals.put("W", "W".equals(result) ? 1L : 0L);
      totals.put("L", "L".equals(result) ? 1L : 0L);
      totals.put("D", "D".equals(result) ? 1L : 0L);
      addStats(seasonPk(season, str(meta, "teamId")), "PLAYER#" + player, totals);
    }
    long now = Instant.now().getEpochSecond();
    setMeta(
        id,
        Map.of(
            "status",
            s("FINAL"),
            "opponentScore",
            n(opponentScore),
            "result",
            s(result),
            "finishedAt",
            n(now),
            "clockRunning",
            boolValue(false)));
    updateTeamGameFields(
        meta,
        id,
        Map.of(
            "status",
            s("FINAL"),
            "opponentScore",
            n(opponentScore),
            "result",
            s(result),
            "finishedAt",
            n(now)));
    return Map.of(
        "result",
        result,
        "teamScore",
        integer(meta, "teamScore", 0),
        "opponentScore",
        opponentScore);
  }

  private Object game(String id) {
    if (id == null || id.isBlank()) throw new IllegalArgumentException("gameIdが必要です");
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (meta.isEmpty()) throw new ApiException(404, "GAME_NOT_FOUND", "試合が見つかりません");
    Map<String, Object> out = plain(meta);
    out.put("players", plainList(rows("GAME#" + id, "PLAYER#")));
    out.put("events", plainList(rows("GAME#" + id, "EVENT#")));
    return out;
  }

  private Map<String, Long> statDelta(String type) {
    return switch (type) {
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
      default -> throw new IllegalArgumentException("スタッツの種類が不正です");
    };
  }

  private static final List<String> STAT_FIELDS =
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

  private void addStats(String pk, String sk, Map<String, Long> deltas) {
    if (deltas.isEmpty()) return;
    Update update = addUpdate(pk, sk, deltas);
    if (update != null)
      db.updateItem(
          UpdateItemRequest.builder()
              .tableName(TABLE)
              .key(key(pk, sk))
              .updateExpression(update.updateExpression())
              .expressionAttributeNames(update.expressionAttributeNames())
              .expressionAttributeValues(update.expressionAttributeValues())
              .build());
  }

  private Update addUpdate(String pk, String sk, Map<String, Long> deltas) {
    return addUpdate(pk, sk, deltas, false);
  }

  private Update addUpdate(
      String pk, String sk, Map<String, Long> deltas, boolean markPlayerPlayed) {
    StringBuilder update =
        new StringBuilder(markPlayerPlayed ? "SET #participation = :played ADD " : "ADD ");
    Map<String, String> names = new HashMap<>();
    Map<String, AttributeValue> values = new HashMap<>();
    if (markPlayerPlayed) {
      names.put("#participation", "participation");
      values.put(":played", s("PLAYED"));
    }
    int i = 0;
    for (var e : deltas.entrySet()) {
      if (e.getValue() == 0) continue;
      if (i > 0) update.append(", ");
      String name = "#f" + i;
      String value = ":v" + i;
      update.append(name).append(' ').append(value);
      names.put(name, e.getKey());
      values.put(value, n(e.getValue()));
      i++;
    }
    if (i == 0) return null;
    return Update.builder()
        .tableName(TABLE)
        .key(key(pk, sk))
        .updateExpression(update.toString())
        .expressionAttributeNames(names)
        .expressionAttributeValues(values)
        .build();
  }

  private void setMeta(String id, Map<String, AttributeValue> changes) {
    set("GAME#" + id, "META", changes);
    setTeamGame(id, changes);
  }

  private void set(String pk, String sk, Map<String, AttributeValue> changes) {
    StringBuilder exp = new StringBuilder("SET ");
    Map<String, String> names = new HashMap<>();
    Map<String, AttributeValue> vals = new HashMap<>();
    int i = 0;
    for (var e : changes.entrySet()) {
      if (i > 0) exp.append(", ");
      String a = "#a" + i, v = ":b" + i;
      exp.append(a).append('=').append(v);
      names.put(a, e.getKey());
      vals.put(v, e.getValue());
      i++;
    }
    db.updateItem(
        UpdateItemRequest.builder()
            .tableName(TABLE)
            .key(key(pk, sk))
            .updateExpression(exp.toString())
            .expressionAttributeNames(names)
            .expressionAttributeValues(vals)
            .build());
  }

  private void syncTeamGame(
      Map<String, AttributeValue> meta, String id, int period, long remaining, boolean running) {
    updateTeamGameFields(
        meta,
        id,
        Map.of(
            "period",
            n(period),
            "remainingSeconds",
            n(remaining),
            "clockRunning",
            boolValue(running)));
  }

  private void updateTeamGameFields(
      Map<String, AttributeValue> meta, String id, Map<String, AttributeValue> changes) {
    set(teamPk(str(meta, "teamId")), str(meta, "teamGameSk"), changes);
  }

  private void setTeamGame(String id, Map<String, AttributeValue> changes) {
    Map<String, AttributeValue> meta = item("GAME#" + id, "META");
    if (!meta.isEmpty() && !str(meta, "teamGameSk").isBlank())
      set(teamPk(str(meta, "teamId")), str(meta, "teamGameSk"), changes);
  }

  private Map<String, AttributeValue> item(String pk, String sk) {
    return db.getItem(
            GetItemRequest.builder().tableName(TABLE).key(key(pk, sk)).consistentRead(true).build())
        .item();
  }

  private void addCurrentLineupMinutes(String id, Map<String, AttributeValue> meta, long now) {
    if (str(meta, "onCourt").isBlank()) return;
    long elapsed =
        Math.max(
            0,
            Math.min(
                now - longValue(meta, "lineupStartedAt", now),
                integer(meta, "remainingSeconds", 0)));
    if (elapsed == 0) return;
    for (String player : str(meta, "onCourt").split(","))
      addStats("GAME#" + id, "PLAYER#" + player, Map.of("minutesSeconds", elapsed));
  }

  private List<Map<String, AttributeValue>> rows(String pk, String prefix) {
    var result =
        db.query(
            QueryRequest.builder()
                .tableName(TABLE)
                .consistentRead(true)
                .keyConditionExpression("pk = :pk AND begins_with(sk, :prefix)")
                .expressionAttributeValues(Map.of(":pk", s(pk), ":prefix", s(prefix)))
                .build());
    return result.items();
  }

  private List<Map<String, AttributeValue>> allRows(String pk) {
    List<Map<String, AttributeValue>> result = new ArrayList<>();
    Map<String, AttributeValue> start = null;
    do {
      var builder =
          QueryRequest.builder()
              .tableName(TABLE)
              .consistentRead(true)
              .keyConditionExpression("pk = :pk")
              .expressionAttributeValues(Map.of(":pk", s(pk)));
      if (start != null && !start.isEmpty()) builder.exclusiveStartKey(start);
      var page = db.query(builder.build());
      result.addAll(page.items());
      start = page.lastEvaluatedKey();
    } while (start != null && !start.isEmpty());
    return result;
  }

  private static String teamPk(String id) {
    return "TEAM#" + (id == null || id.isBlank() ? "MAIN" : id);
  }

  private static String seasonPk(String year, String teamId) {
    String season = "SEASON#" + season(year);
    return "MAIN".equals(teamId) ? season : season + "#TEAM#" + teamId;
  }

  private Map<String, AttributeValue> key(String pk, String sk) {
    Map<String, AttributeValue> m = new HashMap<>();
    m.put("pk", s(pk));
    m.put("sk", s(sk));
    return m;
  }

  private Map<String, Object> plainList(List<Map<String, AttributeValue>> rows) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (var row : rows) out.add(plain(row));
    return Map.of("items", out);
  }

  private Map<String, Object> plain(Map<String, AttributeValue> row) {
    Map<String, Object> out = new HashMap<>();
    row.forEach(
        (k, v) -> {
          if (v.s() != null) out.put(k, v.s());
          else if (v.n() != null) out.put(k, Long.parseLong(v.n()));
          else if (v.bool() != null) out.put(k, v.bool());
          else if (v.hasSs()) out.put(k, v.ss());
        });
    return out;
  }

  private String required(JsonNode n, String field) {
    String v = n.path(field).asText("").trim();
    if (v.isBlank()) throw new IllegalArgumentException(field + "は必須です");
    return v;
  }

  private String required(Map<String, String> values, String field) {
    String v = values.get(field);
    if (v == null || v.isBlank()) throw new IllegalArgumentException(field + "は必須です");
    return v;
  }

  private static String season(String value) {
    String y = value == null ? LocalDate.now().toString().substring(0, 4) : value;
    if (!y.matches("\\d{4}")) throw new IllegalArgumentException("seasonは年4桁で指定してください");
    return y;
  }

  private static String str(Map<String, AttributeValue> m, String k) {
    AttributeValue v = m.get(k);
    return v == null || v.s() == null ? "" : v.s();
  }

  private static int integer(Map<String, AttributeValue> m, String k, int d) {
    try {
      return Integer.parseInt(m.get(k).n());
    } catch (Exception e) {
      try {
        return Integer.parseInt(m.get(k).s());
      } catch (Exception ex) {
        return d;
      }
    }
  }

  private static long longValue(Map<String, AttributeValue> m, String k, long d) {
    try {
      return Long.parseLong(m.get(k).n());
    } catch (Exception e) {
      try {
        return Long.parseLong(m.get(k).s());
      } catch (Exception ex) {
        return d;
      }
    }
  }

  private static boolean bool(Map<String, AttributeValue> m, String k) {
    AttributeValue v = m.get(k);
    return v != null && Boolean.TRUE.equals(v.bool());
  }

  private static AttributeValue s(String v) {
    return AttributeValue.builder().s(v).build();
  }

  private static AttributeValue n(long v) {
    return AttributeValue.builder().n(Long.toString(v)).build();
  }

  private static AttributeValue boolValue(boolean v) {
    return AttributeValue.builder().bool(v).build();
  }

  private static String method(Map<String, Object> input) {
    Object c = input.get("requestContext");
    if (c instanceof Map<?, ?> m && m.get("http") instanceof Map<?, ?> h && h.get("method") != null)
      return h.get("method").toString();
    return input.getOrDefault("httpMethod", "GET").toString();
  }

  private static Map<String, String> query(Map<String, Object> input) {
    Object q = input.get("queryStringParameters");
    if (!(q instanceof Map<?, ?> m)) return Map.of();
    Map<String, String> out = new HashMap<>();
    m.forEach((k, v) -> out.put(String.valueOf(k), v == null ? null : String.valueOf(v)));
    return out;
  }

  private Map<String, Object> response(int status, Object body) {
    return Map.of(
        "statusCode",
        status,
        "headers",
        Map.of("Content-Type", "application/json; charset=UTF-8"),
        "body",
        writeJson(body));
  }

  private String writeJson(Object value) {
    try {
      return JSON.writeValueAsString(value);
    } catch (Exception e) {
      throw new RuntimeException(e);
    }
  }

  private static final class ApiException extends RuntimeException {
    private static final long serialVersionUID = 1L;
    final int status;
    final String code;

    ApiException(int status, String code, String message) {
      super(message);
      this.status = status;
      this.code = code;
    }
  }
}
