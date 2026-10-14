<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { useAuthStore } from "./stores/auth";

const auth = useAuthStore();
const route = useRoute();
const menuOpen = ref(false);
const theme = ref(localStorage.getItem("spa_theme") || "dark");

const navigation = computed(() => [
    { to: "/calendar", label: "予定", icon: "CAL", show: true },
    { to: "/schedules/new", label: "予定登録", icon: "+", show: auth.isAdmin },
    { to: "/announcements", label: "周知", icon: "NEWS", show: auth.isAdmin },
    { to: "/videos", label: "動画", icon: "VID", show: true },
    { to: "/teams", label: "チーム", icon: "TEAM", show: true },
    { to: "/games", label: "試合", icon: "GAME", show: true },
    { to: "/rankings", label: "ランキング", icon: "RANK", show: true },
    { to: "/users", label: "ユーザー", icon: "USER", show: auth.isAdmin },
]);

function toggleTheme(): void {
    theme.value = theme.value === "dark" ? "light" : "dark";
    localStorage.setItem("spa_theme", theme.value);
    document.documentElement.dataset.theme = theme.value;
}

onMounted(async () => {
    document.documentElement.dataset.theme = theme.value;
    await auth.handleCallback();
});
</script>

<template>
    <div class="app-frame">
        <header class="app-header">
            <RouterLink class="brand" to="/">
                <span class="brand-mark">B</span>
                <span><strong>Basketball Team</strong><small>MEMBER WORKSPACE</small></span>
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
                        @click="menuOpen = false"
                    >
                        <span>{{ item.icon }}</span
                        >{{ item.label }}
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
