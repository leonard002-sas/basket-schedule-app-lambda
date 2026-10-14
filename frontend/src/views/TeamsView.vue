<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import { fetchPlayers, fetchTeams } from "../services/api";
import type { Player, Team } from "../types/domain";
const teams = ref<Team[]>([]),
    players = ref<Player[]>([]),
    selected = ref(""),
    loading = ref(true),
    error = ref("");
async function load(): Promise<void> {
    loading.value = true;
    try {
        teams.value = await fetchTeams();
        selected.value ||= teams.value[0]?.teamId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "チームを取得できません";
    } finally {
        loading.value = false;
    }
}
watch(selected, async (id) => {
    players.value = id ? await fetchPlayers(id) : [];
});
onMounted(load);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">TEAM &amp; ROSTER</span>
                <h1>チーム管理</h1>
                <p>登録チームと所属メンバーを確認します。</p>
            </div>
            <select v-model="selected" class="hero-select">
                <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                    {{ team.name }}
                </option>
            </select>
        </header>
        <PageState :loading="loading" :error="error" :empty="!teams.length" @retry="load" />
        <div class="roster-grid">
            <article v-for="player in players" :key="player.playerId" class="player-card">
                <span>#{{ player.number || "—" }}</span>
                <div>
                    <strong>{{ player.name }}</strong
                    ><small>{{ player.position || "POSITION未設定" }}</small>
                </div>
                <i :class="{ inactive: player.active === false }">{{
                    player.active === false ? "登録外" : "ACTIVE"
                }}</i>
            </article>
        </div>
        <aside class="legacy-note">
            <strong>メンバーの登録・編集</strong>
            <p>詳細な選手編集機能は段階移行中です。現在の管理画面も引き続き利用できます。</p>
            <a href="../basketball.html?view=teams">従来のチーム管理を開く ↗</a>
        </aside>
    </section>
</template>
