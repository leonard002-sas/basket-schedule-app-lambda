<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PageState from "../components/PageState.vue";
import { fetchAttendance, saveAttendance } from "../services/api";
import { useScheduleStore } from "../stores/schedules";
import type { AttendancePayload, Schedule } from "../types/domain";

const store = useScheduleStore();
const selected = ref<Schedule | null>(null);
const attendance = ref<AttendancePayload | null>(null);
const attendanceBusy = ref(false);
const month = ref(new Date());
const title = computed(() => `${month.value.getFullYear()}年 ${month.value.getMonth() + 1}月`);
const monthItems = computed(() =>
    store.schedules.filter((item) =>
        item.startDateTime.startsWith(
            `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, "0")}`,
        ),
    ),
);
const cells = computed(() => {
    const first = new Date(month.value.getFullYear(), month.value.getMonth(), 1);
    const last = new Date(month.value.getFullYear(), month.value.getMonth() + 1, 0);
    const rows: Array<{ key: string; day?: number; items: Schedule[]; today?: boolean }> = [];
    for (let index = 0; index < first.getDay(); index++)
        rows.push({ key: `before-${index}`, items: [] });
    for (let day = 1; day <= last.getDate(); day++) {
        const key = `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        rows.push({
            key,
            day,
            items: monthItems.value.filter((item) => item.startDateTime.startsWith(key)),
            today: key === new Date().toLocaleDateString("sv-SE"),
        });
    }
    return rows;
});

async function open(item: Schedule): Promise<void> {
    selected.value = item;
    attendance.value = await fetchAttendance(item).catch(() => null);
}
async function answer(status: string): Promise<void> {
    if (!selected.value) return;
    attendanceBusy.value = true;
    try {
        attendance.value = await saveAttendance(selected.value, status, 0);
    } finally {
        attendanceBusy.value = false;
    }
}
function move(offset: number): void {
    month.value = new Date(month.value.getFullYear(), month.value.getMonth() + offset, 1);
}
onMounted(() => store.load());
</script>

<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">TEAM CALENDAR</span>
                <h1>予定を確認する</h1>
                <p>練習・試合・会議と、みんなの出欠をまとめて確認できます。</p>
            </div>
            <RouterLink class="primary-button" to="/schedules/new">予定を登録</RouterLink>
        </header>
        <section
            v-if="store.announcements.filter((item) => item.visible).length"
            class="announcement-strip"
        >
            <strong>チームへのお知らせ</strong>
            <article
                v-for="item in store.announcements.filter((row) => row.visible)"
                :key="item.id"
            >
                <span>{{
                    item.urgency === "URGENT"
                        ? "緊急"
                        : item.urgency === "IMPORTANT"
                          ? "重要"
                          : "連絡"
                }}</span
                ><b>{{ item.title }}</b>
                <p>{{ item.content }}</p>
            </article>
        </section>
        <PageState :loading="store.loading" :error="store.error" @retry="store.load(true)" />
        <div v-if="!store.loading && !store.error" class="calendar-card">
            <div class="calendar-toolbar">
                <button type="button" @click="move(-1)">←</button>
                <h2>{{ title }}</h2>
                <button type="button" @click="move(1)">→</button>
            </div>
            <div class="weekday-row">
                <span v-for="day in ['日', '月', '火', '水', '木', '金', '土']" :key="day">{{
                    day
                }}</span>
            </div>
            <div class="calendar-grid">
                <div
                    v-for="cell in cells"
                    :key="cell.key"
                    class="calendar-cell"
                    :class="{ today: cell.today, muted: !cell.day }"
                >
                    <b v-if="cell.day">{{ cell.day }}</b
                    ><button
                        v-for="item in cell.items"
                        :key="item.startDateTime"
                        type="button"
                        class="calendar-event"
                        :class="item.eventType.toLowerCase()"
                        @click="open(item)"
                    >
                        <span>{{
                            item.eventType === "GAME"
                                ? "試合"
                                : item.eventType === "MEETING"
                                  ? "会議"
                                  : "練習"
                        }}</span
                        >{{ item.startDateTime.slice(11, 16) }}–{{ item.endDateTime.slice(11, 16) }}
                    </button>
                </div>
            </div>
        </div>
        <section class="upcoming-section">
            <div class="section-heading">
                <span class="eyebrow">UPCOMING</span>
                <h2>今後の予定</h2>
            </div>
            <div class="event-list">
                <button
                    v-for="item in store.upcoming.slice(0, 12)"
                    :key="item.startDateTime"
                    type="button"
                    @click="open(item)"
                >
                    <time
                        ><b>{{ new Date(item.startDateTime).getDate() }}</b
                        >{{
                            new Date(item.startDateTime).toLocaleDateString("ja-JP", {
                                month: "short",
                                weekday: "short",
                            })
                        }}</time
                    ><span
                        ><strong>{{
                            item.eventType === "GAME"
                                ? item.competitionName || "試合"
                                : item.eventType === "MEETING"
                                  ? "会議"
                                  : "練習"
                        }}</strong
                        ><small
                            >{{ item.startDateTime.slice(11, 16) }}–{{
                                item.endDateTime.slice(11, 16)
                            }}
                            · {{ item.facilityName || "施設未設定" }}</small
                        ></span
                    ><i
                        >参加 {{ item.attendanceTotal || 0 }} / 未定
                        {{ item.attendanceMaybe || 0 }}</i
                    >
                </button>
            </div>
        </section>
        <Teleport to="body"
            ><div v-if="selected" class="modal-backdrop" @click.self="selected = null">
                <dialog open class="detail-modal">
                    <button class="modal-close" type="button" @click="selected = null">×</button
                    ><span class="eyebrow">EVENT DETAIL</span>
                    <h2>
                        {{
                            selected.eventType === "GAME"
                                ? selected.competitionName || "試合"
                                : selected.eventType === "MEETING"
                                  ? "会議"
                                  : "練習"
                        }}
                    </h2>
                    <dl>
                        <div>
                            <dt>日時</dt>
                            <dd>
                                {{ new Date(selected.startDateTime).toLocaleString("ja-JP") }}〜{{
                                    selected.endDateTime.slice(11, 16)
                                }}
                            </dd>
                        </div>
                        <div>
                            <dt>施設</dt>
                            <dd>{{ selected.facilityName || "未設定" }}</dd>
                        </div>
                        <div v-if="selected.round">
                            <dt>ラウンド</dt>
                            <dd>{{ selected.round }}</dd>
                        </div>
                    </dl>
                    <div class="attendance-actions">
                        <p>この予定への参加</p>
                        <button
                            :disabled="attendanceBusy"
                            type="button"
                            @click="answer('ATTENDING')"
                        >
                            参加</button
                        ><button :disabled="attendanceBusy" type="button" @click="answer('MAYBE')">
                            未定</button
                        ><button :disabled="attendanceBusy" type="button" @click="answer('ABSENT')">
                            不参加
                        </button>
                    </div>
                    <p v-if="attendance" class="attendance-summary">
                        参加 {{ attendance.attending || 0 }}人 · 未定 {{ attendance.maybe || 0 }}人
                        · 不参加 {{ attendance.absent || 0 }}人
                    </p>
                </dialog>
            </div></Teleport
        >
    </section>
</template>
