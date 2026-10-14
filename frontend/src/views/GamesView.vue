<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import { fetchGames, fetchTeams } from "../services/api";
import type { Game, Team } from "../types/domain";
const teams = ref<Team[]>([]),
    games = ref<Game[]>([]),
    selected = ref(""),
    loading = ref(true),
    error = ref("");
async function load(): Promise<void> {
    loading.value = true;
    try {
        teams.value = await fetchTeams();
        selected.value ||= teams.value[0]?.teamId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "試合を取得できません";
    } finally {
        loading.value = false;
    }
}
watch(selected, async (id) => {
    games.value = id ? (await fetchGames(id)).sort((a, b) => b.date.localeCompare(a.date)) : [];
});
onMounted(load);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">GAME RECORDS</span>
                <h1>試合管理</h1>
                <p>予定と試合記録をつなぎ、結果を日付順に確認できます。</p>
            </div>
            <select v-model="selected" class="hero-select">
                <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                    {{ team.name }}
                </option>
            </select>
        </header>
        <PageState
            :loading="loading"
            :error="error"
            :empty="!games.length"
            empty-text="試合はまだ登録されていません"
            @retry="load"
        />
        <div class="game-list">
            <article v-for="game in games" :key="game.gameId">
                <time>{{ game.date }}</time>
                <div>
                    <small
                        >{{ game.competitionName || "大会未設定"
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
                          : "DRAFT"
                }}</b>
            </article>
        </div>
        <a class="primary-button floating-action" href="../basketball.html?view=games"
            >試合を作成・記録する ↗</a
        >
    </section>
</template>
