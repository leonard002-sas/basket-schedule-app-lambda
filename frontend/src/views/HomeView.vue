<script setup lang="ts">
import { computed, watch } from "vue";
import PageState from "../components/PageState.vue";
import { useAuthStore } from "../stores/auth";
import { useScheduleStore } from "../stores/schedules";

const auth = useAuthStore();
const schedules = useScheduleStore();
const today = computed(() =>
    new Intl.DateTimeFormat("ja-JP", { month: "long", day: "numeric", weekday: "long" }).format(
        new Date(),
    ),
);
const next = computed(() => schedules.upcoming[0]);
const todayKey = new Date().toLocaleDateString("sv-SE");
const todayItems = computed(() =>
    schedules.schedules.filter((item) => item.startDateTime.startsWith(todayKey)),
);
const weekItems = computed(() => {
    const limit = Date.now() + 7 * 24 * 60 * 60 * 1000;
    return schedules.upcoming.filter((item) => new Date(item.startDateTime).getTime() <= limit);
});
const visibleAnnouncements = computed(() => schedules.announcements.filter((item) => item.visible));
function typeLabel(type: string): string {
    return type === "GAME" ? "試合" : type === "MEETING" ? "会議" : "練習";
}
watch(
    () => auth.isAuthenticated,
    async (isAuthenticated) => {
        if (!isAuthenticated) return;
        await schedules.load();
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
                ><RouterLink class="text-link" to="/join">参加申請・新規登録</RouterLink>
            </div>
            <p v-if="auth.callbackPending" class="loading-copy">ログイン情報を確認しています…</p>
            <p v-if="auth.callbackError" class="form-error">{{ auth.callbackError }}</p>
        </div>
        <div class="login-visual">
            <div class="visual-kicker">TEAM / GAME / SCHEDULE</div>
            <div class="court-orbit orbit-one"></div>
            <div class="court-orbit orbit-two"></div>
            <div class="score-display">
                <small>TEAM SCOREBOARD</small>
                <div class="score-row"><strong>HOME</strong><b>86</b></div>
                <span>FINAL · Q4</span>
                <div class="score-row"><strong>AWAY</strong><b>79</b></div>
                <footer><i>GAME 12</i><i>HOME COURT</i></footer>
            </div>
            <div class="ball-mark" aria-hidden="true"><span></span></div>
            <div class="visual-caption"><b>ONE TEAM.</b><span>EVERY MOMENT.</span></div>
        </div>
    </section>
    <section v-else class="page-shell dashboard-home">
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
        <PageState
            :loading="schedules.loading"
            :error="schedules.error"
            @retry="schedules.load(true)"
        />
        <template v-if="!schedules.loading && !schedules.error">
            <section v-if="visibleAnnouncements.length" class="announcement-strip">
                <strong>チームへのお知らせ</strong>
                <article v-for="notice in visibleAnnouncements" :key="notice.id">
                    <span>{{
                        notice.urgency === "URGENT"
                            ? "緊急"
                            : notice.urgency === "IMPORTANT"
                              ? "重要"
                              : "連絡"
                    }}</span>
                    <b>{{ notice.title }}</b>
                    <p>{{ notice.content }}</p>
                </article>
            </section>
            <div class="dashboard-grid">
                <section class="content-card today-card">
                    <div class="section-heading">
                        <span class="eyebrow">TODAY</span>
                        <h2>今日の予定</h2>
                    </div>
                    <div v-if="todayItems.length" class="dashboard-events">
                        <RouterLink
                            v-for="item in todayItems"
                            :key="item.startDateTime"
                            to="/calendar"
                        >
                            <span :class="item.eventType.toLowerCase()">{{
                                typeLabel(item.eventType)
                            }}</span>
                            <strong
                                >{{ item.startDateTime.slice(11, 16) }}–{{
                                    item.endDateTime.slice(11, 16)
                                }}</strong
                            >
                            <small>{{ item.facilityName || "施設未設定" }}</small>
                        </RouterLink>
                    </div>
                    <p v-else class="empty-copy">今日は予定がありません。</p>
                </section>
                <section class="content-card">
                    <div class="section-heading">
                        <span class="eyebrow">NEXT 7 DAYS</span>
                        <h2>今週の予定</h2>
                    </div>
                    <div class="dashboard-events compact">
                        <RouterLink
                            v-for="item in weekItems.slice(0, 5)"
                            :key="item.startDateTime"
                            to="/calendar"
                        >
                            <time>{{
                                new Date(item.startDateTime).toLocaleDateString("ja-JP", {
                                    month: "numeric",
                                    day: "numeric",
                                    weekday: "short",
                                })
                            }}</time>
                            <strong
                                >{{ typeLabel(item.eventType) }} ·
                                {{ item.facilityName || "施設未設定" }}</strong
                            >
                            <small
                                >参加 {{ item.attendanceTotal || 0 }} / 未定
                                {{ item.attendanceMaybe || 0 }}</small
                            >
                        </RouterLink>
                    </div>
                    <p v-if="!weekItems.length" class="empty-copy">今週の予定はありません。</p>
                </section>
            </div>
            <nav class="quick-actions" aria-label="よく使う機能">
                <RouterLink to="/calendar"
                    ><b>01</b><span>予定と出欠を確認<small>CALENDAR</small></span></RouterLink
                >
                <RouterLink to="/games"
                    ><b>02</b><span>試合記録を見る<small>GAME RECORDS</small></span></RouterLink
                >
                <RouterLink to="/videos"
                    ><b>03</b><span>練習動画を探す<small>VIDEO ARCHIVE</small></span></RouterLink
                >
                <RouterLink to="/rankings"
                    ><b>04</b><span>成績を振り返る<small>PLAYER STATS</small></span></RouterLink
                >
            </nav>
        </template>
    </section>
</template>
