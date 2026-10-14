<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageState from "../components/PageState.vue";
import {
    approveUser,
    deleteUser,
    fetchJoinRequests,
    fetchUsers,
    updateUser,
} from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { JoinRequest, ManagedUser } from "../types/domain";
const auth = useAuthStore(),
    rows = ref<ManagedUser[]>([]),
    requests = ref<JoinRequest[]>([]),
    loading = ref(true),
    error = ref(""),
    message = ref(""),
    search = ref("");
const shown = computed(() =>
    rows.value.filter((u) =>
        `${u.email} ${u.username}`.toLowerCase().includes(search.value.toLowerCase()),
    ),
);
const currentSub = computed(() => auth.claims?.sub);
async function load() {
    loading.value = true;
    error.value = "";
    try {
        const [users, joinRequests] = await Promise.all([
            auth.isRootAdmin ? fetchUsers() : Promise.resolve([]),
            fetchJoinRequests(),
        ]);
        rows.value = users;
        requests.value = joinRequests.items || [];
    } catch (e) {
        error.value = e instanceof Error ? e.message : "ユーザーを取得できません";
    } finally {
        loading.value = false;
    }
}
async function action(user: ManagedUser, value: string) {
    if (!confirm(`${user.email || user.username} の設定を変更しますか？`)) return;
    try {
        await updateUser(user.username, value);
        message.value = "変更しました";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "変更できません";
    }
}
async function remove(user: ManagedUser) {
    if (!confirm(`${user.email || user.username} を完全に削除しますか？`)) return;
    try {
        await deleteUser(user.username);
        message.value = "削除しました";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "削除できません";
    }
}
async function approveRequest(request: JoinRequest) {
    try {
        await approveUser(request.username);
        message.value = `${request.displayName || request.email}を承認しました`;
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "承認できません";
    }
}
onMounted(load);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">USER ADMINISTRATION</span>
                <h1>ユーザー管理</h1>
                <p>参加申請、権限、利用状態を一か所で管理します。</p>
            </div>
            <input
                v-model="search"
                class="hero-search"
                type="search"
                placeholder="名前・メールで検索"
            />
        </header>
        <PageState
            :loading="loading"
            :error="error"
            :empty="!rows.length && !requests.length"
            @retry="load"
        />
        <p class="inline-status" role="status">{{ message }}</p>
        <section v-if="requests.length" class="request-section">
            <div class="section-heading">
                <span class="eyebrow">PENDING</span>
                <h2>参加申請 {{ requests.length }}件</h2>
            </div>
            <div class="user-list">
                <article v-for="request in requests" :key="request.username">
                    <span class="user-avatar">{{
                        (request.displayName || request.email).slice(0, 1)
                    }}</span>
                    <div>
                        <strong>{{ request.displayName || "表示名未設定" }}</strong
                        ><small
                            >{{ request.email
                            }}<template v-if="request.message">
                                · {{ request.message }}</template
                            ></small
                        >
                    </div>
                    <button class="primary-button" type="button" @click="approveRequest(request)">
                        承認する
                    </button>
                </article>
            </div>
        </section>
        <section v-if="auth.isRootAdmin" class="request-section">
            <div class="section-heading">
                <span class="eyebrow">ACCOUNT CONTROL</span>
                <h2>登録済みアカウント</h2>
            </div>
            <div class="user-list">
                <article v-for="user in shown" :key="user.username">
                    <span class="user-avatar">{{
                        (user.email || user.username).slice(0, 1).toUpperCase()
                    }}</span>
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
                    <div
                        v-if="user.role !== 'root-admin' && user.sub !== currentSub"
                        class="user-actions"
                    >
                        <button
                            type="button"
                            @click="
                                action(
                                    user,
                                    user.role === 'admin' ? 'demote-admin' : 'promote-admin',
                                )
                            "
                        >
                            {{ user.role === "admin" ? "権限解除" : "管理者へ" }}</button
                        ><button
                            type="button"
                            @click="action(user, user.enabled ? 'disable' : 'enable')"
                        >
                            {{ user.enabled ? "停止" : "再開" }}</button
                        ><button class="danger-button" type="button" @click="remove(user)">
                            削除
                        </button>
                    </div>
                    <span v-else class="status-badge">保護</span>
                </article>
            </div>
        </section>
    </section>
</template>
