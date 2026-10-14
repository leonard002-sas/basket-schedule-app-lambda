<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import { createSchedules } from "../services/api";
import { useScheduleStore } from "../stores/schedules";

const store = useScheduleStore();
const busy = ref(false);
const message = ref("");
const form = reactive({
    eventType: "PRACTICE",
    date: new Date().toLocaleDateString("sv-SE"),
    startTime: "18:30",
    endTime: "21:00",
    facilityId: "",
    competitionName: "",
    round: "",
    videoUrl: "",
    videoTags: "",
});
async function submit(): Promise<void> {
    busy.value = true;
    message.value = "登録しています…";
    try {
        await createSchedules([{ ...form }]);
        message.value = "予定を登録しました。";
        await store.load(true);
    } catch (error) {
        message.value = error instanceof Error ? error.message : "登録できませんでした";
    } finally {
        busy.value = false;
    }
}
onMounted(() => store.load());
</script>
<template>
    <section class="page-shell narrow">
        <header class="page-hero">
            <div>
                <span class="eyebrow">NEW SCHEDULE</span>
                <h1>予定を登録</h1>
                <p>練習・試合・会議をチームカレンダーへ追加します。</p>
            </div>
        </header>
        <form class="form-card" @submit.prevent="submit">
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
                <label><span>日付</span><input v-model="form.date" type="date" required /></label
                ><label
                    ><span>開始</span><input v-model="form.startTime" type="time" required /></label
                ><label
                    ><span>終了</span><input v-model="form.endTime" type="time" required /></label
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
                    ><span>大会名</span
                    ><input v-model="form.competitionName" placeholder="例：秋季北区大会" /></label
                ><label v-if="form.eventType === 'GAME'"
                    ><span>ラウンド</span
                    ><input v-model="form.round" placeholder="例：1回戦" /></label
                ><label class="wide"
                    ><span>動画URL（任意）</span
                    ><input
                        v-model="form.videoUrl"
                        type="url"
                        placeholder="https://youtube.com/..." /></label
                ><label class="wide"
                    ><span>動画タグ（任意）</span
                    ><input v-model="form.videoTags" placeholder="練習全体, シュート"
                /></label>
            </div>
            <div class="form-footer">
                <p role="status">{{ message }}</p>
                <button class="primary-button" :disabled="busy" type="submit">
                    {{ busy ? "登録中…" : "予定を登録" }}
                </button>
            </div>
        </form>
        <aside class="legacy-note">
            <strong>画像からまとめて登録</strong>
            <p>カレンダー画像のAI解析や繰り返し登録は、移行期間中も従来画面から利用できます。</p>
            <a href="../register.html">従来の登録画面を開く ↗</a>
        </aside>
    </section>
</template>
