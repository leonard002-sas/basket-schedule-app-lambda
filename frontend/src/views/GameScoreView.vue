<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import PageState from "../components/PageState.vue";
import {
    controlClock,
    fetchGame,
    finishGame,
    recordStat,
    saveLineup,
    undoStat,
} from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { GameDetail, PlayerStats, StatAction } from "../types/domain";
const route = useRoute(),
    auth = useAuthStore(),
    game = ref<GameDetail | null>(null),
    loading = ref(true),
    busy = ref(false),
    error = ref(""),
    selectedPlayer = ref(""),
    lineup = ref<string[]>([]),
    opponentScore = ref(0),
    tick = ref(Date.now());
let timer: number | undefined;
const gameId = String(route.params.gameId);
const activePlayers = computed(
    () => game.value?.players.filter((p) => p.participation !== "DNP") || [],
);
const seconds = computed(() => {
    const stored = game.value?.remainingSeconds || 0;
    if (!game.value?.clockRunning || !game.value.clockStartedAt) return stored;
    return Math.max(
        0,
        stored - Math.floor((tick.value - new Date(game.value.clockStartedAt).getTime()) / 1000),
    );
});
const clock = computed(
    () => `${Math.floor(seconds.value / 60)}:${String(seconds.value % 60).padStart(2, "0")}`,
);
async function load() {
    loading.value = true;
    try {
        game.value = await fetchGame(gameId);
        opponentScore.value = game.value.opponentScore || 0;
        const raw = game.value.onCourt;
        lineup.value = Array.isArray(raw)
            ? raw
            : typeof raw === "string"
              ? raw.split(",").filter(Boolean)
              : [];
        selectedPlayer.value ||= activePlayers.value[0]?.playerId || "";
    } catch (e) {
        error.value = e instanceof Error ? e.message : "試合を取得できません";
    } finally {
        loading.value = false;
    }
}
async function mutate(action: () => Promise<unknown>) {
    busy.value = true;
    try {
        await action();
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : "保存できません";
    } finally {
        busy.value = false;
    }
}
function toggleLineup(id: string) {
    lineup.value = lineup.value.includes(id)
        ? lineup.value.filter((v) => v !== id)
        : lineup.value.length < 5
          ? [...lineup.value, id]
          : lineup.value;
}
function finish() {
    if (window.confirm("試合を終了して保存しますか？"))
        void mutate(() => finishGame(gameId, opponentScore.value));
}
const actions: Array<{ type: StatAction; label: string; group: string }> = [
    { type: "FG2_MADE", label: "2PT ✓", group: "shot" },
    { type: "FG2_MISS", label: "2PT ×", group: "miss" },
    { type: "FG3_MADE", label: "3PT ✓", group: "shot" },
    { type: "FG3_MISS", label: "3PT ×", group: "miss" },
    { type: "FT_MADE", label: "FT ✓", group: "shot" },
    { type: "FT_MISS", label: "FT ×", group: "miss" },
    { type: "OREB", label: "OREB", group: "stat" },
    { type: "DREB", label: "DREB", group: "stat" },
    { type: "AST", label: "AST", group: "stat" },
    { type: "STL", label: "STL", group: "stat" },
    { type: "BLK", label: "BLK", group: "stat" },
    { type: "TO", label: "TO", group: "negative" },
    { type: "PF", label: "PF", group: "negative" },
];
function points(p: PlayerStats) {
    return p.points ?? p.PTS ?? 0;
}
onMounted(() => {
    load();
    timer = window.setInterval(() => (tick.value = Date.now()), 1000);
});
onBeforeUnmount(() => window.clearInterval(timer));
</script>
<template>
    <section class="page-shell">
        <header class="page-hero score-hero">
            <div>
                <span class="eyebrow">LIVE SCOREBOOK</span>
                <h1>{{ game?.opponent ? `vs ${game.opponent}` : "試合記録" }}</h1>
                <p>{{ game?.date }} · Q{{ game?.period || 1 }}</p>
            </div>
            <div class="scoreboard">
                <strong>{{ game?.teamScore || 0 }}</strong
                ><span>{{ clock }}</span
                ><strong>{{ opponentScore }}</strong>
            </div>
        </header>
        <PageState :loading="loading" :error="error" @retry="load" />
        <template v-if="game"
            ><section v-if="auth.isAdmin && game.status !== 'FINAL'" class="form-card lineup-panel">
                <div>
                    <h2>コート上の5人</h2>
                    <p>{{ lineup.length }}/5人を選択して確定します。</p>
                </div>
                <div class="player-toggle-list">
                    <button
                        v-for="p in activePlayers"
                        :key="p.playerId"
                        type="button"
                        :class="{ selected: lineup.includes(p.playerId) }"
                        @click="toggleLineup(p.playerId)"
                    >
                        #{{ p.number ?? "—" }} {{ p.name }}<small>{{ p.position }}</small>
                    </button>
                </div>
                <button
                    class="primary-button"
                    :disabled="lineup.length !== 5 || busy"
                    type="button"
                    @click="mutate(() => saveLineup(gameId, lineup))"
                >
                    5人を確定
                </button>
            </section>
            <section v-if="auth.isAdmin && game.status !== 'FINAL'" class="score-control-grid">
                <div class="form-card">
                    <h2>ゲームクロック</h2>
                    <div class="clock-large">{{ clock }}</div>
                    <div class="button-row">
                        <button
                            type="button"
                            @click="
                                mutate(() =>
                                    controlClock(gameId, game?.clockRunning ? 'pause' : 'start'),
                                )
                            "
                        >
                            {{ game.clockRunning ? "一時停止" : "開始" }}</button
                        ><button type="button" @click="mutate(() => controlClock(gameId, 'next'))">
                            次のQ</button
                        ><button type="button" @click="mutate(() => controlClock(gameId, 'reset'))">
                            リセット
                        </button>
                    </div>
                </div>
                <div class="form-card">
                    <h2>記録する選手</h2>
                    <div class="player-toggle-list compact">
                        <button
                            v-for="p in activePlayers"
                            :key="p.playerId"
                            type="button"
                            :class="{ selected: selectedPlayer === p.playerId }"
                            @click="selectedPlayer = p.playerId"
                        >
                            #{{ p.number ?? "—" }} {{ p.name }}
                        </button>
                    </div>
                    <div class="stat-pad">
                        <button
                            v-for="action in actions"
                            :key="action.type"
                            type="button"
                            :class="action.group"
                            :disabled="!selectedPlayer || busy"
                            @click="mutate(() => recordStat(gameId, selectedPlayer, action.type))"
                        >
                            {{ action.label }}
                        </button>
                    </div>
                    <button type="button" @click="mutate(() => undoStat(gameId))">
                        ↶ 直前の記録を取り消す
                    </button>
                </div>
            </section>
            <section class="form-card stats-table-card">
                <div class="section-heading">
                    <span class="eyebrow">BOX SCORE</span>
                    <h2>選手スタッツ</h2>
                </div>
                <div class="table-scroll">
                    <table class="stats-table">
                        <thead>
                            <tr>
                                <th>PLAYER</th>
                                <th>PTS</th>
                                <th>REB</th>
                                <th>AST</th>
                                <th>STL</th>
                                <th>BLK</th>
                                <th>FGM</th>
                                <th>FGA</th>
                                <th>3PM</th>
                                <th>3PA</th>
                                <th>FTM</th>
                                <th>FTA</th>
                                <th>TO</th>
                                <th>PF</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr
                                v-for="p in game.players"
                                :key="p.playerId"
                                :class="{ dnp: p.participation === 'DNP' }"
                            >
                                <td>
                                    #{{ p.number ?? "—" }} {{ p.name
                                    }}<small v-if="p.participation === 'DNP'">DNP</small>
                                </td>
                                <td>{{ points(p) }}</td>
                                <td>{{ p.REB || 0 }}</td>
                                <td>{{ p.AST || 0 }}</td>
                                <td>{{ p.STL || 0 }}</td>
                                <td>{{ p.BLK || 0 }}</td>
                                <td>{{ p.FGM || 0 }}</td>
                                <td>{{ p.FGA || 0 }}</td>
                                <td>{{ p.FG3M || 0 }}</td>
                                <td>{{ p.FG3A || 0 }}</td>
                                <td>{{ p.FTM || 0 }}</td>
                                <td>{{ p.FTA || 0 }}</td>
                                <td>{{ p.TO || 0 }}</td>
                                <td>{{ p.PF || 0 }}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>
            <section v-if="auth.isAdmin && game.status !== 'FINAL'" class="finish-panel">
                <label
                    >相手チーム得点
                    <input v-model.number="opponentScore" type="number" min="0" /></label
                ><button class="danger-button" type="button" @click="finish">試合終了・保存</button>
            </section></template
        >
    </section>
</template>
