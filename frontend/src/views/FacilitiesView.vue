<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import PageState from "../components/PageState.vue";
import { createFacility, deleteFacility, fetchFacilities, updateFacility } from "../services/api";
import type { Facility } from "../types/domain";
const rows = ref<Facility[]>([]);
const loading = ref(true);
const error = ref("");
const message = ref("");
const form = reactive({ facilityName: "", address: "", url: "", note: "" });
const editingId = ref("");
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
        if (editingId.value) await updateFacility({ facilityId: editingId.value, ...form });
        else await createFacility(form);
        Object.assign(form, { facilityName: "", address: "", url: "", note: "" });
        message.value = editingId.value ? "施設を更新しました。" : "施設を登録しました。";
        editingId.value = "";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "登録できません";
    }
}
function edit(row: Facility): void {
    editingId.value = row.facilityId;
    Object.assign(form, {
        facilityName: row.facilityName,
        address: row.address || "",
        url: row.url || "",
        note: row.note || "",
    });
}
function cancelEdit(): void {
    editingId.value = "";
    Object.assign(form, { facilityName: "", address: "", url: "", note: "" });
}
async function remove(row: Facility): Promise<void> {
    if (!confirm(`${row.facilityName}を施設一覧から削除しますか？`)) return;
    try {
        await deleteFacility(row.facilityId);
        message.value = "施設を削除しました。過去の予定情報は保持されます。";
        await load();
    } catch (e) {
        message.value = e instanceof Error ? e.message : "施設を削除できません";
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
                <h2>{{ editingId ? "施設を編集" : "新しい施設" }}</h2>
                <label><span>施設名</span><input v-model="form.facilityName" required /></label
                ><label><span>住所</span><input v-model="form.address" required /></label
                ><label><span>施設URL</span><input v-model="form.url" type="url" /></label
                ><label><span>備考</span><textarea v-model="form.note" rows="4"></textarea></label>
                <div class="form-footer">
                    <p>{{ message }}</p>
                    <button v-if="editingId" type="button" @click="cancelEdit">キャンセル</button>
                    <button class="primary-button" type="submit">
                        {{ editingId ? "更新" : "施設を登録" }}
                    </button>
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
                    <div class="card-actions">
                        <button type="button" @click="edit(row)">編集</button
                        ><button class="danger-button" type="button" @click="remove(row)">
                            削除
                        </button>
                    </div>
                </article>
            </section>
        </div>
    </section>
</template>
