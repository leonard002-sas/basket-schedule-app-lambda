<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute } from "vue-router";
import NavIcon from "./components/NavIcon.vue";
import { useAuthStore } from "./stores/auth";
import { useUploadStore } from "./stores/uploads";
import { useScheduleStore } from "./stores/schedules";

const auth = useAuthStore();
const uploads = useUploadStore();
const schedules = useScheduleStore();
const route = useRoute();
const menuOpen = ref(false);
const theme = ref(localStorage.getItem("spa_theme") || "dark");
watch(
    () => uploads.jobs.map((job) => `${job.jobId}:${job.status}`).join("|"),
    (_current, previous = "") => {
        const previouslyCompleted = new Set(
            previous
                .split("|")
                .filter((entry) => entry.endsWith(":COMPLETED"))
                .map((entry) => entry.slice(0, -":COMPLETED".length)),
        );
        if (
            uploads.jobs.some(
                (job) => job.status === "COMPLETED" && !previouslyCompleted.has(job.jobId),
            )
        )
            void schedules.load(true);
    },
);

const navigation = computed(() => [
    { to: "/", label: "ホーム", icon: "home", show: true },
    { to: "/calendar", label: "予定", icon: "calendar", show: true },
    { to: "/schedules/new", label: "予定登録", icon: "add", show: auth.isAdmin },
    { to: "/facilities", label: "施設", icon: "facility", show: auth.isAdmin },
    { to: "/announcements", label: "周知", icon: "notice", show: auth.isAdmin },
    { to: "/videos", label: "動画", icon: "video", show: true },
    { to: "/teams", label: "チーム", icon: "team", show: true },
    { to: "/games", label: "試合", icon: "game", show: true },
    { to: "/rankings", label: "ランキング", icon: "ranking", show: true },
    { to: "/users", label: "ユーザー", icon: "user", show: auth.isAdmin },
]);

function toggleTheme(): void {
    theme.value = theme.value === "dark" ? "light" : "dark";
    localStorage.setItem("spa_theme", theme.value);
    document.documentElement.dataset.theme = theme.value;
}

onMounted(async () => {
    document.documentElement.dataset.theme = theme.value;
    await auth.handleCallback();
    uploads.initialize();
});
</script>

<template>
    <div class="app-frame">
        <aside v-if="uploads.jobs.length" class="global-job-tray" aria-live="polite">
            <article v-for="job in uploads.jobs" :key="job.jobId" :class="job.status.toLowerCase()">
                <span>{{
                    job.status === "COMPLETED" ? "✓" : job.status === "FAILED" ? "!" : "◌"
                }}</span>
                <div>
                    <strong>{{ job.fileName }}</strong
                    ><small>{{ job.message || job.stage || job.status }}</small
                    ><progress
                        :value="job.completed || (job.status === 'COMPLETED' ? 100 : 25)"
                        :max="job.total || 100"
                    />
                </div>
                <button
                    v-if="['COMPLETED', 'FAILED', 'UNAVAILABLE'].includes(job.status)"
                    type="button"
                    aria-label="閉じる"
                    @click="uploads.dismiss(job.jobId)"
                >
                    ×
                </button>
            </article>
        </aside>
        <header class="app-header">
            <RouterLink class="brand" to="/">
                <span class="brand-mark" aria-hidden="true">
                    <svg viewBox="0 0 48 48" role="img">
                        <circle cx="24" cy="24" r="17" />
                        <path
                            d="M24 7c-5 5-7 10-7 17s2 12 7 17M24 7c5 5 7 10 7 17s-2 12-7 17M8 20c8 4 24 4 32 0M8 28c8-4 24-4 32 0"
                        />
                    </svg>
                </span>
                <span><strong>BASKETBALL TEAM</strong><small>TEAM OPERATIONS HUB</small></span>
            </RouterLink>
            <div class="header-actions">
                <button
                    class="icon-button"
                    type="button"
                    :aria-label="`${theme === 'dark' ? 'ライト' : 'ダーク'}モードへ変更`"
                    @click="toggleTheme"
                >
                    {{ theme === "dark" ? "☀" : "☾" }}
                </button>
                <RouterLink v-if="auth.isAuthenticated" class="account-chip" to="/account"
                    ><span>{{ auth.email.slice(0, 1).toUpperCase() }}</span
                    ><small>{{ auth.email }}</small></RouterLink
                >
                <button v-else class="primary-button compact" type="button" @click="auth.login()">
                    ログイン
                </button>
                <button
                    v-if="auth.isAuthenticated"
                    class="mobile-menu"
                    type="button"
                    aria-label="メニュー"
                    @click="menuOpen = !menuOpen"
                >
                    ☰
                </button>
            </div>
        </header>

        <div v-if="auth.isAuthenticated" class="workspace">
            <aside class="sidebar" :class="{ open: menuOpen }">
                <nav aria-label="メインメニュー">
                    <RouterLink
                        v-for="item in navigation.filter((row) => row.show)"
                        :key="item.to"
                        :to="item.to"
                        :class="{
                            'nav-current':
                                item.to === '/'
                                    ? route.path === '/'
                                    : route.path.startsWith(item.to),
                        }"
                        @click="menuOpen = false"
                    >
                        <span><NavIcon :name="item.icon" /></span>{{ item.label }}
                    </RouterLink>
                </nav>
                <div class="sidebar-foot">
                    <span>{{
                        auth.isRootAdmin ? "ROOT ADMIN" : auth.isAdmin ? "ADMIN" : "MEMBER"
                    }}</span>
                    <p>必要な情報を、チームみんなで。</p>
                </div>
            </aside>
            <main class="workspace-main">
                <Transition name="page" mode="out-in"
                    ><RouterView :key="route.fullPath"
                /></Transition>
            </main>
        </div>
        <main v-else class="guest-main"><RouterView /></main>
    </div>
</template>
