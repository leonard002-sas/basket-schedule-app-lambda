<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { deleteOwnAccount, fetchProfile, saveProfile } from "../services/api";
import { useAuthStore } from "../stores/auth";
import type { NotificationOffset } from "../types/domain";
const auth = useAuthStore(),
    busy = ref(false),
    message = ref(""),
    profile = reactive<{ displayName: string; notificationOffsets: NotificationOffset }>({
        displayName: "",
        notificationOffsets: "NONE",
    });
async function load() {
    try {
        Object.assign(profile, await fetchProfile());
    } catch (e) {
        message.value = e instanceof Error ? e.message : "プロフィールを取得できません";
    }
}
async function save() {
    busy.value = true;
    try {
        Object.assign(profile, await saveProfile(profile));
        message.value = "プロフィールを保存しました";
    } catch (e) {
        message.value = e instanceof Error ? e.message : "保存できません";
    } finally {
        busy.value = false;
    }
}
async function remove() {
    const phrase = prompt("削除すると元に戻せません。確認のため「削除」と入力してください。");
    if (phrase !== "削除") return;
    busy.value = true;
    try {
        await deleteOwnAccount();
        auth.logout();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "アカウントを削除できません";
        busy.value = false;
    }
}
onMounted(load);
</script>
<template>
    <section class="page-shell narrow">
        <header class="page-hero">
            <div>
                <span class="eyebrow">ACCOUNT</span>
                <h1>アカウント設定</h1>
                <p>チーム内で表示する名前と通知方法を設定します。</p>
            </div>
        </header>
        <section class="account-card">
            <span class="account-avatar-large">{{ auth.email.slice(0, 1).toUpperCase() }}</span>
            <div>
                <small>ログイン中</small>
                <h2>{{ profile.displayName || auth.email }}</h2>
                <p>
                    {{ auth.isRootAdmin ? "ルート管理者" : auth.isAdmin ? "管理者" : "メンバー" }} ·
                    {{ auth.email }}
                </p>
            </div>
        </section>
        <form class="form-card" @submit.prevent="save">
            <h2>プロフィール</h2>
            <label
                ><span>表示名</span
                ><input
                    v-model="profile.displayName"
                    required
                    maxlength="40"
                    placeholder="チーム内で表示する名前" /></label
            ><label
                ><span>予定のメール通知</span
                ><select v-model="profile.notificationOffsets">
                    <option value="NONE">送信しない</option>
                    <option value="DAY_BEFORE">1日前</option>
                    <option value="HOUR_BEFORE">1時間前</option>
                    <option value="BOTH">1日前と1時間前</option>
                </select></label
            >
            <div class="form-footer">
                <p role="status">{{ message }}</p>
                <button class="primary-button" :disabled="busy" type="submit">保存</button>
            </div>
        </form>
        <section class="form-card danger-zone">
            <h2>ログインとアカウント</h2>
            <p>
                既存アカウントにGoogleを連携すると、次回からどちらの方法でも同じアカウントへログインできます。
            </p>
            <div class="button-row">
                <button class="secondary-button" type="button" @click="auth.linkGoogle()">
                    Googleアカウントを連携</button
                ><button type="button" @click="auth.logout()">ログアウト</button
                ><button class="danger-button" :disabled="busy" type="button" @click="remove">
                    アカウントを削除
                </button>
            </div>
        </section>
    </section>
</template>
