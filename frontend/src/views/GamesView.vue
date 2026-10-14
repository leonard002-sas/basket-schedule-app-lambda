<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import { fetchGames, fetchPlayers, fetchTeams, importGame, saveGame } from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useScheduleStore } from "../stores/schedules";
import type { Game, Player, Schedule, Team } from "../types/domain";
import { parseCsv } from "../utils/csv";
const auth = useAuthStore(),
    scheduleStore = useScheduleStore(),
    teams = ref<Team[]>([]),
    players = ref<Player[]>([]),
    games = ref<Game[]>([]),
    selected = ref(localStorage.getItem("basket_team_id") || ""),
    loading = ref(true),
    busy = ref(false),
    error = ref(""),
    message = ref("");
const participants = ref<string[]>([]);
const form = reactive({
    gameId: "",
    date: new Date().toLocaleDateString("sv-SE"),
    opponent: "",
    quarterMinutes: 10,
    scheduleKey: "",
    opponentScore: 0,
});
const csvFile = ref<File | null>(null);
const gameSchedules = computed(() => scheduleStore.schedules.filter((s) => s.eventType === "GAME"));
async function load() {
    loading.value = true;
    error.value = "";
    try {
        [teams.value] = await Promise.all([fetchTeams(), scheduleStore.load()]);
        selected.value = teams.value.some((t) => t.teamId === selected.value)
            ? selected.value
            : teams.value[0]?.teamId || "";
        await loadTeam(selected.value);
    } catch (e) {
        error.value = e instanceof Error ? e.message : "試合を取得できません";
    } finally {
        loading.value = false;
    }
}
async function loadTeam(id: string) {
    if (!id) {
        games.value = [];
        players.value = [];
        return;
    }
    localStorage.setItem("basket_team_id", id);
    [games.value, players.value] = await Promise.all([fetchGames(id), fetchPlayers(id)]);
    games.value.sort((a, b) => b.date.localeCompare(a.date));
    participants.value = players.value.filter((p) => p.active !== false).map((p) => p.playerId);
}
watch(
    () => form.scheduleKey,
    (key) => {
        const row = gameSchedules.value.find((item) => scheduleKey(item) === key);
        if (row) {
            form.date = row.startDateTime.slice(0, 10);
        }
    },
);
onMounted(load);
function scheduleKey(s: Schedule) {
    return `${s.scheduleMonth}|${s.startDateTime}`;
}
function reset() {
    Object.assign(form, {
        gameId: "",
        date: new Date().toLocaleDateString("sv-SE"),
        opponent: "",
        quarterMinutes: 10,
        scheduleKey: "",
        opponentScore: 0,
    });
    participants.value = players.value.filter((p) => p.active !== false).map((p) => p.playerId);
}
function edit(game: Game) {
    Object.assign(form, {
        gameId: game.gameId,
        date: game.date,
        opponent: game.opponent,
        quarterMinutes: game.quarterMinutes || 10,
        scheduleKey:
            game.scheduleMonth && game.startDateTime
                ? `${game.scheduleMonth}|${game.startDateTime}`
                : "",
        opponentScore: game.opponentScore || 0,
    });
    participants.value = game.rosterPlayerIds || participants.value;
    window.scrollTo({ top: 0, behavior: "smooth" });
}
async function submit() {
    if (!selected.value) return;
    if (!form.gameId && participants.value.length < 5) {
        message.value = "出場予定メンバーを5人以上選択してください。";
        return;
    }
    busy.value = true;
    try {
        const schedule = gameSchedules.value.find((s) => scheduleKey(s) === form.scheduleKey);
        await saveGame(selected.value, {
            ...(form.gameId ? { gameId: form.gameId } : { participantIds: participants.value }),
            date: form.date,
            opponent: form.opponent,
            quarterMinutes: form.quarterMinutes,
            opponentScore: form.opponentScore,
            ...(schedule
                ? {
                      scheduleMonth: schedule.scheduleMonth,
                      startDateTime: schedule.startDateTime,
                      competitionName: schedule.competitionName,
                      round: schedule.round,
                  }
                : {}),
        });
        message.value = form.gameId ? "試合情報を更新しました" : "試合を作成しました";
        reset();
        await loadTeam(selected.value);
    } catch (e) {
        message.value = e instanceof Error ? e.message : "保存できません";
    } finally {
        busy.value = false;
    }
}
function selectCsv(event: Event) {
    csvFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}
async function uploadCsv() {
    if (!csvFile.value || !selected.value) return;
    busy.value = true;
    try {
        const text = await csvFile.value.text();
        const lines = parseCsv(text);
        const header = lines.shift()?.map((v) => v.toUpperCase()) || [];
        if (!header.length || !lines.length) throw new Error("CSVに選手データがありません");
        const value = (row: string[], ...keys: string[]) => {
            const index = keys.map((key) => header.indexOf(key)).find((item) => item >= 0) ?? -1;
            return index >= 0 ? row[index] || "0" : "0";
        };
        const aliases: Record<string, string[]> = {
            FG3M: ["FG3M", "3PM"],
            FG3A: ["FG3A", "3PA"],
        };
        const playerRows = lines
            .filter((row) => row[0] && !/^total$/i.test(row[0]))
            .map((row) => ({
                name: row[0],
                stats: Object.fromEntries(
                    [
                        "PTS",
                        "REB",
                        "AST",
                        "STL",
                        "BLK",
                        "FGM",
                        "FGA",
                        "FG3M",
                        "FG3A",
                        "FTM",
                        "FTA",
                        "OREB",
                        "DREB",
                        "TO",
                        "PF",
                    ].map((key) => [key, Number(value(row, ...(aliases[key] || [key])) || 0)]),
                ),
            }));
        if (!playerRows.length) throw new Error("取り込める選手行がありません");
        await importGame(selected.value, {
            date: form.date,
            opponent: form.opponent || "過去試合",
            opponentScore: form.opponentScore,
            players: playerRows,
        });
        message.value = `${playerRows.length}人分の記録を取り込みました`;
        await loadTeam(selected.value);
    } catch (e) {
        message.value = e instanceof Error ? e.message : "CSVを取り込めません";
    } finally {
        busy.value = false;
    }
}
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">GAME RECORDS</span>
                <h1>試合管理</h1>
                <p>予定との紐づけ、出場メンバー、ライブ記録、過去データをまとめて管理します。</p>
            </div>
            <select v-model="selected" class="hero-select" @change="loadTeam(selected)">
                <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                    {{ team.name }}
                </option>
            </select>
        </header>
        <PageState :loading="loading" :error="error" @retry="load" />
        <div v-if="selected && !loading" class="management-grid games-layout">
            <form v-if="auth.isAdmin" class="form-card" @submit.prevent="submit">
                <span class="eyebrow">{{ form.gameId ? "EDIT GAME" : "NEW GAME" }}</span>
                <h2>{{ form.gameId ? "試合情報を編集" : "試合を作成" }}</h2>
                <div class="form-grid">
                    <label class="wide"
                        ><span>予定表の試合と連携（任意）</span
                        ><select v-model="form.scheduleKey">
                            <option value="">連携する予定を選択（任意）</option>
                            <option
                                v-for="s in gameSchedules"
                                :key="scheduleKey(s)"
                                :value="scheduleKey(s)"
                            >
                                {{ s.startDateTime.slice(0, 10) }} ·
                                {{ s.competitionName || s.facilityName || "試合" }}
                            </option>
                        </select></label
                    ><label
                        ><span>試合日</span
                        ><input v-model="form.date" type="date" required /></label
                    ><label><span>対戦相手</span><input v-model="form.opponent" required /></label
                    ><label
                        ><span>1Q（分）</span
                        ><input
                            v-model.number="form.quarterMinutes"
                            type="number"
                            min="1"
                            max="30" /></label
                    ><label v-if="form.gameId"
                        ><span>相手得点</span
                        ><input v-model.number="form.opponentScore" type="number" min="0"
                    /></label>
                </div>
                <fieldset v-if="!form.gameId" class="roster-picker">
                    <legend>今回の出場予定メンバー</legend>
                    <p>{{ participants.length }}人を選択中 · 5人以上必要です</p>
                    <label
                        v-for="p in players.filter((row) => row.active !== false)"
                        :key="p.playerId"
                        :class="{ selected: participants.includes(p.playerId) }"
                        ><input v-model="participants" type="checkbox" :value="p.playerId" /><span
                            >#{{ p.number ?? "—" }} {{ p.name }}</span
                        ><small>{{ p.position }}</small></label
                    >
                </fieldset>
                <div class="form-footer">
                    <button v-if="form.gameId" type="button" @click="reset">キャンセル</button
                    ><button class="primary-button" :disabled="busy" type="submit">
                        {{ form.gameId ? "更新" : "試合を作成" }}
                    </button>
                </div>
            </form>
            <section class="form-card">
                <span class="eyebrow">HISTORY IMPORT</span>
                <h2>過去試合をCSVで取り込む</h2>
                <p>
                    スプレッドシートをCSV形式で保存して選択してください。1列目は選手名、以降は
                    PTS・REB・AST などの見出しを使用します。
                </p>
                <input type="file" accept=".csv,text/csv" @change="selectCsv" /><button
                    class="secondary-button"
                    :disabled="!csvFile || busy"
                    type="button"
                    @click="uploadCsv"
                >
                    CSVを取り込む
                </button>
            </section>
        </div>
        <p class="inline-status" role="status">{{ message }}</p>
        <div class="game-list">
            <article v-for="game in games" :key="game.gameId">
                <time>{{ game.date }}</time>
                <div>
                    <small
                        >{{ game.competitionName || "通常試合"
                        }}<template v-if="game.round"> · {{ game.round }}</template></small
                    >
                    <h2>vs {{ game.opponent || "対戦相手未設定" }}</h2>
                </div>
                <div class="game-score">
                    <strong>{{ game.status === "FINAL" ? game.teamScore : "—" }}</strong
                    ><span>–</span
                    ><strong>{{ game.status === "FINAL" ? game.opponentScore : "—" }}</strong>
                </div>
                <b class="status-badge">{{
                    game.status === "FINAL"
                        ? game.result === "W"
                            ? "WIN"
                            : game.result === "L"
                              ? "LOSS"
                              : "DRAW"
                        : game.status === "LIVE"
                          ? "LIVE"
                          : "READY"
                }}</b>
                <div class="card-actions">
                    <RouterLink class="secondary-button" :to="`/games/${game.gameId}`">{{
                        game.status === "FINAL"
                            ? "結果を見る"
                            : game.status === "LIVE"
                              ? "記録を再開"
                              : "記録開始"
                    }}</RouterLink
                    ><button v-if="auth.isAdmin" type="button" @click="edit(game)">編集</button>
                </div>
            </article>
        </div>
    </section>
</template>
