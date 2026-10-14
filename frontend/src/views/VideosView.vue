<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageState from "../components/PageState.vue";
import { useScheduleStore } from "../stores/schedules";
const store = useScheduleStore();
const tag = ref("");
const videos = computed(() => store.schedules.filter((s) => s.videoUrl));
const tags = computed(() => [
    ...new Set(
        videos.value.flatMap((s) =>
            (s.videoTags || "")
                .split(",")
                .map((v) => v.trim())
                .filter(Boolean),
        ),
    ),
]);
const shown = computed(() =>
    tag.value
        ? videos.value.filter((s) =>
              (s.videoTags || "")
                  .split(",")
                  .map((v) => v.trim())
                  .includes(tag.value),
          )
        : videos.value,
);
onMounted(() => store.load());
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">VIDEO ARCHIVE</span>
                <h1>練習動画</h1>
                <p>予定に紐づけた限定公開動画を、日付やタグから振り返れます。</p>
            </div>
            <select v-model="tag" class="hero-select">
                <option value="">すべてのタグ</option>
                <option v-for="item in tags" :key="item">{{ item }}</option>
            </select>
        </header>
        <PageState
            :loading="store.loading"
            :error="store.error"
            :empty="!shown.length"
            empty-text="動画はまだ登録されていません"
            @retry="store.load(true)"
        />
        <div class="card-grid">
            <article v-for="video in shown" :key="video.startDateTime" class="video-card">
                <div class="video-thumbnail"><span>PLAY</span><b>▶</b></div>
                <small>{{ new Date(video.startDateTime).toLocaleDateString("ja-JP") }}</small>
                <h2>{{ video.competitionName || video.facilityName || "練習動画" }}</h2>
                <p>{{ video.videoTags || "タグ未設定" }}</p>
                <a :href="video.videoUrl" target="_blank" rel="noopener">YouTubeで見る ↗</a>
            </article>
        </div>
    </section>
</template>
