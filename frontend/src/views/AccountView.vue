<script setup lang="ts">
import { useAuthStore } from "../stores/auth";
const auth = useAuthStore();
</script>
<template>
    <section class="page-shell narrow">
        <header class="page-hero">
            <div>
                <span class="eyebrow">ACCOUNT</span>
                <h1>アカウント</h1>
                <p>ログイン情報とチーム内での権限を確認できます。</p>
            </div>
        </header>
        <section class="account-card">
            <span class="account-avatar-large">{{ auth.email.slice(0, 1).toUpperCase() }}</span>
            <div>
                <small>ログイン中</small>
                <h2>{{ auth.email }}</h2>
                <p>
                    {{ auth.isRootAdmin ? "ルート管理者" : auth.isAdmin ? "管理者" : "メンバー" }}
                </p>
            </div>
        </section>
        <div class="account-actions">
            <button class="secondary-button" type="button" @click="auth.logout()">ログアウト</button
            ><a class="text-button" href="../index.html">従来画面のアカウント設定を開く ↗</a>
        </div>
    </section>
</template>
