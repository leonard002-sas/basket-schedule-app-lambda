<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import PageState from "../components/PageState.vue";
import { createFacility, fetchFacilities } from "../services/api";
import type { Facility } from "../types/domain";
const rows = ref<Facility[]>([]);
const loading = ref(true);
const error = ref("");
const message = ref("");
const form = reactive({ facilityName: "", address: "", url: "", note: "" });
async function load(): Promise<void> {
    loading.value = true;
    try {
        rows.value = await fetchFacilities();
    } catch (e) {
        error.value = e instanceof Error ? e.message : "施設を取得できません";
    } finally {
        loading.value = false;
    }
}
async function submit(): Promise<void> {
    message.value = "登録しています…";
    try {
        await createFacility(form);
        Object.assign(form, { facilityName: "", address: "", url: "", note: "" });
        message.value = "施設を登録しました。";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "登録できません";
    }
}
onMounted(load);
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">FACILITIES</span>
                <h1>施設管理</h1>
                <p>チームが利用する体育館や会場をまとめて管理します。</p>
            </div>
        </header>
        <div class="two-column">
            <form class="form-card" @submit.prevent="submit">
                <h2>新しい施設</h2>
                <label><span>施設名</span><input v-model="form.facilityName" required /></label
                ><label><span>住所</span><input v-model="form.address" /></label
                ><label><span>施設URL</span><input v-model="form.url" type="url" /></label
                ><label><span>備考</span><textarea v-model="form.note" rows="4"></textarea></label>
                <div class="form-footer">
                    <p>{{ message }}</p>
                    <button class="primary-button" type="submit">施設を登録</button>
                </div>
            </form>
            <section class="content-card">
                <h2>登録済み施設</h2>
                <PageState :loading="loading" :error="error" :empty="!rows.length" @retry="load" />
                <article v-for="row in rows" :key="row.facilityId" class="list-card">
                    <div>
                        <strong>{{ row.facilityName }}</strong>
                        <p>{{ row.address || "住所未設定" }}</p>
                        <small v-if="row.note">{{ row.note }}</small>
                    </div>
                    <a v-if="row.url" :href="row.url" target="_blank" rel="noopener"
                        >施設ページ ↗</a
                    >
                </article>
            </section>
        </div>
    </section>
</template>
