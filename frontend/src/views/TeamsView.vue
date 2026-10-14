<script setup lang="ts">
import { onMounted, reactive, ref, watch } from "vue";
import PageState from "../components/PageState.vue";
import {
    deletePlayer,
    deleteTeam,
    fetchPlayers,
    fetchTeams,
    savePlayer,
    saveTeam,
} from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { Player, Team } from "../types/domain";
const auth = useAuthStore(),
    teams = ref<Team[]>([]),
    players = ref<Player[]>([]),
    selected = ref(""),
    loading = ref(true),
    busy = ref(false),
    error = ref(""),
    message = ref("");
const teamName = ref("");
const player = reactive<{ playerId?: string; name: string; number?: number; position: string }>({
    name: "",
    position: "PG",
});
async function load() {
    loading.value = true;
    error.value = "";
    try {
        teams.value = await fetchTeams();
        selected.value = teams.value.some((t) => t.teamId === selected.value)
            ? selected.value
            : teams.value[0]?.teamId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "チームを取得できません";
    } finally {
        loading.value = false;
    }
}
async function loadPlayers(id: string) {
    players.value = id ? await fetchPlayers(id) : [];
}
watch(selected, loadPlayers);
onMounted(load);
function editPlayer(row?: Player) {
    player.playerId = row?.playerId;
    player.name = row?.name || "";
    player.number = row?.number;
    player.position = row?.position || "PG";
}
async function submitTeam() {
    if (!teamName.value.trim()) return;
    busy.value = true;
    try {
        await saveTeam({ name: teamName.value.trim() });
        teamName.value = "";
        message.value = "チームを登録しました";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "登録できません";
    } finally {
        busy.value = false;
    }
}
async function removeTeam() {
    if (!selected.value || !confirm("チームと紐づく選手・試合を削除します。よろしいですか？"))
        return;
    await deleteTeam(selected.value);
    selected.value = "";
    await load();
}
async function submitPlayer() {
    if (!selected.value || !player.name.trim()) return;
    busy.value = true;
    try {
        await savePlayer(selected.value, { ...player, name: player.name.trim() });
        message.value = player.playerId ? "選手情報を更新しました" : "選手を登録しました";
        editPlayer();
        await loadPlayers(selected.value);
    } catch (e) {
        message.value = e instanceof Error ? e.message : "保存できません";
    } finally {
        busy.value = false;
    }
}
async function removePlayer(row: Player) {
    if (!confirm(`${row.name}を登録外にしますか？`)) return;
    await deletePlayer(selected.value, row.playerId);
    await loadPlayers(selected.value);
}
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">TEAM &amp; ROSTER</span>
                <h1>チーム管理</h1>
                <p>チームと所属メンバーをまとめて登録・編集します。</p>
            </div>
            <select v-model="selected" class="hero-select">
                <option value="">チームを選択</option>
                <option v-for="team in teams" :key="team.teamId" :value="team.teamId">
                    {{ team.name }}
                </option>
            </select>
        </header>
        <PageState :loading="loading" :error="error" @retry="load" />
        <div v-if="!loading" class="management-grid">
            <form v-if="auth.isAdmin" class="form-card compact-form" @submit.prevent="submitTeam">
                <div>
                    <span class="eyebrow">TEAM</span>
                    <h2>チームを登録</h2>
                </div>
                <label
                    ><span>チーム名</span
                    ><input v-model="teamName" required maxlength="50" /></label
                ><button class="primary-button" :disabled="busy" type="submit">登録</button
                ><button v-if="selected" class="danger-button" type="button" @click="removeTeam">
                    選択中のチームを削除
                </button>
            </form>
            <form
                v-if="auth.isAdmin && selected"
                class="form-card compact-form"
                @submit.prevent="submitPlayer"
            >
                <div>
                    <span class="eyebrow">ROSTER</span>
                    <h2>{{ player.playerId ? "メンバーを編集" : "メンバーを登録" }}</h2>
                </div>
                <label
                    ><span>表示名</span
                    ><input v-model="player.name" required maxlength="40" /></label
                ><label
                    ><span>背番号</span
                    ><input v-model.number="player.number" type="number" min="0" max="99" /></label
                ><label
                    ><span>ポジション</span
                    ><select v-model="player.position">
                        <option v-for="p in ['PG', 'SG', 'SF', 'PF', 'C']" :key="p">
                            {{ p }}
                        </option>
                    </select></label
                ><button class="primary-button" :disabled="busy" type="submit">
                    {{ player.playerId ? "更新" : "登録" }}</button
                ><button v-if="player.playerId" type="button" @click="editPlayer()">
                    キャンセル
                </button>
            </form>
        </div>
        <p class="inline-status" role="status">{{ message }}</p>
        <div v-if="selected" class="roster-grid">
            <article v-for="row in players" :key="row.playerId" class="player-card">
                <span>#{{ row.number ?? "—" }}</span>
                <div>
                    <strong>{{ row.name }}</strong
                    ><small>{{ row.position || "未設定" }}</small>
                </div>
                <i :class="{ inactive: row.active === false }">{{
                    row.active === false ? "登録外" : "ACTIVE"
                }}</i>
                <div v-if="auth.isAdmin" class="card-actions">
                    <button type="button" @click="editPlayer(row)">編集</button
                    ><button type="button" @click="removePlayer(row)">削除</button>
                </div>
            </article>
        </div>
        <div v-else-if="!loading" class="empty-card">チームを登録または選択してください。</div>
    </section>
</template>
