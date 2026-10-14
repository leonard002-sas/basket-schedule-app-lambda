<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import { createSchedules } from "../services/api";
import { useScheduleStore } from "../stores/schedules";
import { useUploadStore } from "../stores/uploads";
import type { EventType } from "../types/domain";
interface FormRow {
    id: string;
    eventType: EventType;
    date: string;
    startTime: string;
    endTime: string;
    facilityId: string;
    competitionName: string;
    round: string;
    videoUrl: string;
    videoTags: string;
}
const store = useScheduleStore();
const uploads = useUploadStore();
const route = useRoute();
const rows = ref<FormRow[]>([newRow()]);
const busy = ref(false),
    message = ref(""),
    repeatWeeks = ref(1),
    imageFile = ref<File | null>(null);
function localDate() {
    return new Date().toLocaleDateString("sv-SE");
}
function newRow(source?: FormRow): FormRow {
    return {
        id: crypto.randomUUID(),
        eventType: source?.eventType ?? "PRACTICE",
        date: source?.date ?? localDate(),
        startTime: source?.startTime ?? "18:30",
        endTime: source?.endTime ?? "21:00",
        facilityId: source?.facilityId ?? "",
        competitionName: source?.competitionName ?? "",
        round: source?.round ?? "",
        videoUrl: source?.videoUrl ?? "",
        videoTags: source?.videoTags ?? "",
    };
}
function addRow(source?: FormRow) {
    rows.value.push(newRow(source));
}
function removeRow(index: number) {
    if (rows.value.length > 1) rows.value.splice(index, 1);
}
const registrationRows = computed(() =>
    rows.value.flatMap((row) =>
        Array.from({ length: Math.max(1, repeatWeeks.value) }, (_, week) => {
            const date = new Date(`${row.date}T00:00:00`);
            date.setDate(date.getDate() + week * 7);
            const facility = store.facilities.find((item) => item.facilityId === row.facilityId);
            return {
                ...row,
                id: undefined,
                date: date.toLocaleDateString("sv-SE"),
                facilityName: facility?.facilityName || "",
            };
        }),
    ),
);
async function submit() {
    busy.value = true;
    message.value = `${registrationRows.value.length}件を登録しています…`;
    try {
        await createSchedules(registrationRows.value);
        message.value = `${registrationRows.value.length}件の予定を登録しました。`;
        repeatWeeks.value = 1;
        await store.load(true);
    } catch (error) {
        message.value = error instanceof Error ? error.message : "登録できませんでした";
    } finally {
        busy.value = false;
    }
}
function selectImage(event: Event) {
    imageFile.value = (event.target as HTMLInputElement).files?.[0] ?? null;
}
async function uploadImage() {
    if (!imageFile.value) return;
    busy.value = true;
    message.value = "画像をアップロードしています…";
    try {
        await uploads.start(imageFile.value);
        message.value = "アップロード完了。画面上部で解析状況を確認できます。";
    } catch (error) {
        message.value = error instanceof Error ? error.message : "画像を登録できませんでした";
    } finally {
        busy.value = false;
    }
}
onMounted(() => {
    if (typeof route.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(route.query.date))
        rows.value[0].date = route.query.date;
    return store.load();
});
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">NEW SCHEDULE</span>
                <h1>予定を登録</h1>
                <p>1件ずつの登録、複製、毎週の繰り返し、画像解析をこの画面で行えます。</p>
            </div>
            <RouterLink class="secondary-button" to="/calendar">カレンダーを確認</RouterLink>
        </header>
        <section class="form-card upload-panel">
            <div>
                <span class="eyebrow">AI IMAGE IMPORT</span>
                <h2>カレンダー画像から登録</h2>
                <p>画像をアップロードすると、処理中もほかの画面を利用できます。</p>
            </div>
            <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                @change="selectImage"
            /><button
                class="primary-button"
                type="button"
                :disabled="!imageFile || busy"
                @click="uploadImage"
            >
                画像を解析
            </button>
        </section>
        <form class="schedule-builder" @submit.prevent="submit">
            <div class="builder-toolbar">
                <div>
                    <h2>手入力で登録</h2>
                    <p>同じ曜日の予定は繰り返し件数を指定できます。</p>
                </div>
                <label
                    >毎週
                    <input v-model.number="repeatWeeks" type="number" min="1" max="52" /> 回</label
                >
            </div>
            <article v-for="(form, index) in rows" :key="form.id" class="form-card schedule-row">
                <div class="row-heading">
                    <strong>予定 {{ index + 1 }}</strong>
                    <div>
                        <button type="button" @click="addRow(form)">複製</button
                        ><button
                            type="button"
                            :disabled="rows.length === 1"
                            @click="removeRow(index)"
                        >
                            削除
                        </button>
                    </div>
                </div>
                <div class="segmented">
                    <label
                        v-for="type in [
                            { v: 'PRACTICE', l: '練習' },
                            { v: 'GAME', l: '試合' },
                            { v: 'MEETING', l: '会議' },
                        ]"
                        :key="type.v"
                        ><input v-model="form.eventType" type="radio" :value="type.v" /><span>{{
                            type.l
                        }}</span></label
                    >
                </div>
                <div class="form-grid">
                    <label
                        ><span>日付</span><input v-model="form.date" type="date" required /></label
                    ><label
                        ><span>開始</span
                        ><input v-model="form.startTime" type="time" required /></label
                    ><label
                        ><span>終了</span
                        ><input v-model="form.endTime" type="time" required /></label
                    ><label class="wide"
                        ><span>施設</span
                        ><select v-model="form.facilityId" required>
                            <option value="">施設を選択</option>
                            <option
                                v-for="facility in store.facilities"
                                :key="facility.facilityId"
                                :value="facility.facilityId"
                            >
                                {{ facility.facilityName }}
                            </option>
                        </select></label
                    ><label v-if="form.eventType === 'GAME'"
                        ><span>大会名</span><input v-model="form.competitionName" /></label
                    ><label v-if="form.eventType === 'GAME'"
                        ><span>ラウンド</span><input v-model="form.round" /></label
                    ><label class="wide"
                        ><span>動画URL（任意）</span
                        ><input v-model="form.videoUrl" type="url" /></label
                    ><label class="wide"
                        ><span>動画タグ（任意）</span><input v-model="form.videoTags"
                    /></label>
                </div>
            </article>
            <div class="builder-footer">
                <button class="secondary-button" type="button" @click="addRow()">
                    ＋ 別の予定を追加
                </button>
                <p role="status">{{ message }}</p>
                <button class="primary-button" :disabled="busy" type="submit">
                    {{ busy ? "登録中…" : `${registrationRows.length}件を登録` }}
                </button>
            </div>
        </form>
    </section>
</template>
