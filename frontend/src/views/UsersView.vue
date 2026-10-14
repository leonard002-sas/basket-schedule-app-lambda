<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageState from "../components/PageState.vue";
import { fetchUsers, updateUser } from "../services/api";
import type { ManagedUser } from "../types/domain";
const rows = ref<ManagedUser[]>([]),
    loading = ref(true),
    error = ref(""),
    search = ref("");
const shown = computed(() =>
    rows.value.filter((u) =>
        `${u.email} ${u.username}`.toLowerCase().includes(search.value.toLowerCase()),
    ),
);
async function load(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
        rows.value = await fetchUsers();
    } catch (e) {
        error.value = e instanceof Error ? e.message : "ユーザーを取得できません";
    } finally {
        loading.value = false;
    }
}
async function action(user: ManagedUser, value: string): Promise<void> {
    if (!confirm(`${user.email} の設定を変更しますか？`)) return;
    await updateUser(user.username, value);
    await load();
}
onMounted(load);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">USER ADMINISTRATION</span>
                <h1>ユーザー管理</h1>
                <p>登録状態、権限、利用状況を安全に管理します。</p>
            </div>
            <input
                v-model="search"
                class="hero-search"
                type="search"
                placeholder="名前・メールで検索"
            />
        </header>
        <PageState :loading="loading" :error="error" :empty="!rows.length" @retry="load" />
        <div class="user-list">
            <article v-for="user in shown" :key="user.username">
                <span class="user-avatar">{{ user.email.slice(0, 1).toUpperCase() }}</span>
                <div>
                    <strong>{{ user.email || user.username }}</strong
                    ><small
                        >{{ user.emailVerified ? "メール確認済み" : "メール未確認" }} ·
                        {{ user.status }}</small
                    >
                </div>
                <div class="user-badges">
                    <b>{{ user.role }}</b
                    ><b :class="{ disabled: !user.enabled }">{{
                        user.enabled ? "利用中" : "停止中"
                    }}</b>
                </div>
                <div class="user-actions">
                    <button
                        v-if="user.status === 'UNCONFIRMED'"
                        type="button"
                        @click="action(user, 'approve')"
                    >
                        承認</button
                    ><button
                        type="button"
                        @click="
                            action(user, user.role === 'admin' ? 'demote-admin' : 'promote-admin')
                        "
                    >
                        {{ user.role === "admin" ? "権限解除" : "管理者へ" }}</button
                    ><button
                        type="button"
                        @click="action(user, user.enabled ? 'disable' : 'enable')"
                    >
                        {{ user.enabled ? "停止" : "再開" }}
                    </button>
                </div>
            </article>
        </div>
    </section>
</template>
