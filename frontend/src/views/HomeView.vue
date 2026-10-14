<script setup lang="ts">
import { computed, watch } from "vue";
import { useRouter } from "vue-router";
import { useAuthStore } from "../stores/auth";
import { useScheduleStore } from "../stores/schedules";

const auth = useAuthStore();
const schedules = useScheduleStore();
const router = useRouter();
const today = computed(() =>
    new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(
        new Date(),
    ),
);
const next = computed(() => schedules.upcoming[0]);
watch(
    () => auth.isAuthenticated,
    async (isAuthenticated) => {
        if (!isAuthenticated) return;
        await schedules.load();
        if (!schedules.error) router.replace("/calendar");
    },
    { immediate: true },
);
</script>

<template>
    <section v-if="!auth.isAuthenticated" class="login-landing">
        <div class="login-copy">
            <span class="eyebrow">TEAM WORKSPACE</span>
            <h1>予定も、試合も、<br /><em>ひとつのチーム体験へ。</em></h1>
            <p>
                スケジュール、出欠、周知、動画、試合記録を、管理者とメンバーが同じ場所で扱えるチームサイトです。
            </p>
            <div class="hero-actions">
                <button class="primary-button" type="button" @click="auth.login()">
                    メンバーログイン</button
                ><button class="secondary-button" type="button" @click="auth.login('Google')">
                    Googleでログイン</button
                ><a class="text-link" href="../join.html">参加申請・新規登録</a>
            </div>
            <p v-if="auth.callbackPending" class="loading-copy">ログイン情報を確認しています…</p>
            <p v-if="auth.callbackError" class="form-error">{{ auth.callbackError }}</p>
        </div>
        <div class="login-visual">
            <div class="court-orbit orbit-one"></div>
            <div class="court-orbit orbit-two"></div>
            <div class="score-display">
                <small>NEXT GAME</small><strong>HOME <b>86</b></strong
                ><span>FINAL</span><strong>AWAY <b>79</b></strong>
            </div>
            <div class="ball-mark">●</div>
        </div>
    </section>
    <section v-else class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">{{ today }}</span>
                <h1>チームホーム</h1>
                <p>
                    {{
                        next
                            ? `次の予定は${new Date(next.startDateTime).toLocaleDateString("ja-JP")}です。`
                            : "次の予定はまだありません。"
                    }}
                </p>
            </div>
        </header>
    </section>
</template>
