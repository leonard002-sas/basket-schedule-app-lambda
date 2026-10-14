<script setup lang="ts">
defineProps<{ loading?: boolean; error?: string; empty?: boolean; emptyText?: string }>();
defineEmits<{ retry: [] }>();
</script>

<template>
    <div v-if="loading" class="state-panel">
        <span class="spinner"></span><strong>読み込んでいます</strong>
        <p>チーム情報を準備しています。</p>
    </div>
    <div v-else-if="error" class="state-panel error">
        <strong>読み込めませんでした</strong>
        <p>{{ error }}</p>
        <button class="secondary-button" type="button" @click="$emit('retry')">再試行</button>
    </div>
    <div v-else-if="empty" class="state-panel">
        <strong>{{ emptyText || "まだデータがありません" }}</strong>
        <p>登録されると、ここに表示されます。</p>
    </div>
</template>
