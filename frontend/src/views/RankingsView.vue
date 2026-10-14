<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import { fetchLeaderboard, fetchTeams } from "../services/api";
import type { Team } from "../types/domain";
const teams = ref<Team[]>([]),
    rows = ref<Record<string, string | number>[]>([]),
    selected = ref(""),
    season = ref(String(new Date().getFullYear())),
    loading = ref(true),
    error = ref("");
const sortKey = ref("PTS");
const sorted = computed(() =>
    [...rows.value].sort((a, b) => Number(b[sortKey.value] || 0) - Number(a[sortKey.value] || 0)),
);
async function loadTeams(): Promise<void> {
    loading.value = true;
    try {
        teams.value = await fetchTeams();
        selected.value ||= teams.value[0]?.teamId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "ランキングを取得できません";
    } finally {
        loading.value = false;
    }
}
async function load(): Promise<void> {
    if (selected.value) rows.value = await fetchLeaderboard(selected.value, season.value);
}
watch([selected, season], load);
onMounted(loadTeams);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">PLAYER RANKINGS</span>
                <h1>スタッツランキング</h1>
                <p>出場試合数と平均を含め、選手の記録を比較できます。</p>
            </div>
            <div class="hero-controls">
                <select v-model="selected" class="hero-select">
                    <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                        {{ team.name }}
                    </option></select
                ><select v-model="season" class="hero-select">
                    <option
                        v-for="year in 5"
                        :key="year"
                        :value="String(new Date().getFullYear() - year + 1)"
                    >
                        {{ new Date().getFullYear() - year + 1 }}
                    </option>
                </select>
            </div>
        </header>
        <PageState
            :loading="loading"
            :error="error"
            :empty="!rows.length"
            empty-text="集計できる試合結果がありません"
            @retry="loadTeams"
        />
        <div class="ranking-tabs">
            <button
                v-for="key in ['PTS', 'REB', 'AST', 'STL', 'BLK', 'EFF']"
                :key="key"
                type="button"
                :class="{ active: sortKey === key }"
                @click="sortKey = key"
            >
                {{ key }}
            </button>
        </div>
        <div class="ranking-list">
            <article v-for="(row, index) in sorted" :key="String(row.playerId)">
                <strong>{{ String(index + 1).padStart(2, "0") }}</strong>
                <div>
                    <b>{{ row.playerName || row.name || "選手" }}</b
                    ><small>{{ row.GP || 0 }} GAMES</small>
                </div>
                <span
                    >{{ Number(row[sortKey] || 0).toFixed(sortKey === "PTS" ? 1 : 0)
                    }}<small>{{ sortKey }}</small></span
                >
            </article>
        </div>
    </section>
</template>
