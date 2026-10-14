<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import { fetchLeaderboard, fetchPlayerTrend, fetchTeams } from "../services/api";
import type { Team } from "../types/domain";
import { downloadCsv } from "../utils/exports";
const teams = ref<Team[]>([]),
    rows = ref<Record<string, string | number>[]>([]),
    trend = ref<Record<string, string | number>[]>([]),
    selected = ref(""),
    selectedPlayer = ref(""),
    season = ref(String(new Date().getFullYear())),
    loading = ref(true),
    error = ref(""),
    sortKey = ref("PTS");
const metrics = ["PTS", "PPG", "REB", "RPG", "AST", "APG", "STL", "BLK", "MPG", "EFF"];
const normalizedRows = computed<Record<string, string | number>[]>(() =>
    rows.value.map((row) => {
        const games = Math.max(0, Number(row.GP || 0));
        const points = Number(row.PTS ?? row.points ?? 0);
        const rebounds = Number(row.REB || 0);
        const assists = Number(row.AST || 0);
        const made = Number(row.FGM || 0);
        const attempts = Number(row.FGA || 0);
        const freeThrows = Number(row.FTM || 0);
        const freeThrowAttempts = Number(row.FTA || 0);
        const efficiency =
            points +
            rebounds +
            assists +
            Number(row.STL || 0) +
            Number(row.BLK || 0) -
            (attempts - made) -
            (freeThrowAttempts - freeThrows) -
            Number(row.TO || 0);
        return {
            ...row,
            PTS: points,
            PPG: games ? points / games : 0,
            RPG: games ? rebounds / games : 0,
            APG: games ? assists / games : 0,
            MPG: games ? Number(row.minutesSeconds || 0) / 60 / games : 0,
            EFF: efficiency,
        } as Record<string, string | number>;
    }),
);
const sorted = computed(() =>
    [...normalizedRows.value].sort(
        (a, b) => Number(b[sortKey.value] || 0) - Number(a[sortKey.value] || 0),
    ),
);
const selectedName = computed(
    () => rows.value.find((r) => String(r.playerId) === selectedPlayer.value)?.playerName || "",
);
async function loadTeams() {
    loading.value = true;
    error.value = "";
    try {
        teams.value = await fetchTeams();
        selected.value ||= teams.value[0]?.teamId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "ランキングを取得できません";
    } finally {
        loading.value = false;
    }
}
async function load() {
    if (!selected.value) return;
    loading.value = true;
    try {
        rows.value = await fetchLeaderboard(selected.value, season.value);
        selectedPlayer.value = String(rows.value[0]?.playerId || "");
    } catch (e) {
        error.value = e instanceof Error ? e.message : "ランキングを取得できません";
    } finally {
        loading.value = false;
    }
}
async function loadTrend() {
    trend.value =
        selected.value && selectedPlayer.value
            ? (await fetchPlayerTrend(selected.value, selectedPlayer.value, season.value)).items
            : [];
}
watch([selected, season], load);
watch(selectedPlayer, loadTrend);
onMounted(loadTeams);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">PLAYER RANKINGS</span>
                <h1>スタッツランキング</h1>
                <p>出場試合数、合計、平均、試合ごとの推移を確認できます。</p>
            </div>
            <div class="hero-controls">
                <select v-model="selected" class="hero-select">
                    <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                        {{ team.name }}
                    </option></select
                ><select v-model="season" class="hero-select">
                    <option
                        v-for="offset in 6"
                        :key="offset"
                        :value="String(new Date().getFullYear() - offset + 1)"
                    >
                        {{ new Date().getFullYear() - offset + 1 }}
                    </option></select
                ><button
                    class="secondary-button"
                    type="button"
                    @click="downloadCsv(normalizedRows, `${season}-stats.csv`)"
                >
                    CSV出力
                </button>
            </div>
        </header>
        <PageState
            :loading="loading"
            :error="error"
            :empty="!rows.length"
            empty-text="集計できる試合結果がありません"
            @retry="load"
        />
        <div class="ranking-tabs">
            <button
                v-for="key in metrics"
                :key="key"
                type="button"
                :class="{ active: sortKey === key }"
                @click="sortKey = key"
            >
                {{ key }}
            </button>
        </div>
        <div class="ranking-list">
            <article
                v-for="(row, index) in sorted"
                :key="String(row.playerId)"
                :class="{ selected: selectedPlayer === String(row.playerId) }"
                @click="selectedPlayer = String(row.playerId)"
            >
                <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
                <div>
                    <b>{{ row.playerName || row.name || "選手" }}</b
                    ><small>{{ row.GP || 0 }} GAMES · DNP {{ row.DNP || 0 }}</small>
                </div>
                <span
                    >{{
                        Number(row[sortKey] || 0).toFixed(
                            ["PPG", "RPG", "APG", "MPG"].includes(sortKey) ? 1 : 0,
                        )
                    }}<small>{{ sortKey }}</small></span
                >
            </article>
        </div>
        <section v-if="selectedPlayer" class="form-card trend-panel">
            <div class="section-heading">
                <span class="eyebrow">PLAYER TREND</span>
                <h2>{{ selectedName }}の試合別推移</h2>
            </div>
            <div v-if="trend.length" class="trend-chart">
                <article v-for="item in trend" :key="String(item.gameId)">
                    <div>
                        <strong>{{ item.date }}</strong
                        ><small>vs {{ item.opponent }}</small>
                    </div>
                    <span v-for="key in ['PTS', 'REB', 'AST']" :key="key"
                        ><b>{{ item[key] || (key === "PTS" ? item.points : 0) || 0 }}</b
                        >{{ key }}</span
                    >
                </article>
            </div>
            <p v-else>表示できる試合記録がありません。</p>
        </section>
    </section>
</template>
