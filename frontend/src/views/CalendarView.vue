<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { useRouter } from "vue-router";
import PageState from "../components/PageState.vue";
import {
    deleteSchedule,
    fetchAttendance,
    fetchScheduleDetail,
    saveAttendance,
    updateSchedule,
} from "../services/api";
import { useAuthStore } from "../stores/auth";
import { useScheduleStore } from "../stores/schedules";
import type { AttendancePayload, AttendanceStatus, Schedule } from "../types/domain";
import { downloadCalendar, lineTemplate } from "../utils/exports";
const auth = useAuthStore(),
    store = useScheduleStore(),
    router = useRouter(),
    selected = ref<Schedule | null>(null),
    attendance = ref<AttendancePayload | null>(null),
    attendanceBusy = ref(false),
    month = ref(new Date()),
    editing = ref(false),
    bulkOpen = ref(false),
    guestCount = ref(0),
    comment = ref(""),
    message = ref("");
const holidays = ref<Record<string, string>>({});
const bulk = reactive<Record<string, AttendanceStatus | "">>({});
const edit = reactive({
    date: "",
    startTime: "",
    endTime: "",
    facilityId: "",
    eventType: "PRACTICE",
    competitionName: "",
    round: "",
    videoUrl: "",
    videoTags: "",
});
const monthKey = computed(
        () => `${month.value.getFullYear()}-${String(month.value.getMonth() + 1).padStart(2, "0")}`,
    ),
    title = computed(() => `${month.value.getFullYear()}年 ${month.value.getMonth() + 1}月`),
    monthItems = computed(() =>
        store.schedules.filter((item) => item.startDateTime.startsWith(monthKey.value)),
    );
const cells = computed(() => {
    const first = new Date(month.value.getFullYear(), month.value.getMonth(), 1),
        last = new Date(month.value.getFullYear(), month.value.getMonth() + 1, 0),
        rows: Array<{
            key: string;
            day?: number;
            items: Schedule[];
            today?: boolean;
            holiday?: string;
        }> = [];
    for (let i = 0; i < first.getDay(); i++) rows.push({ key: `before-${i}`, items: [] });
    for (let day = 1; day <= last.getDate(); day++) {
        const key = `${monthKey.value}-${String(day).padStart(2, "0")}`;
        rows.push({
            key,
            day,
            items: monthItems.value.filter((item) => item.startDateTime.startsWith(key)),
            today: key === new Date().toLocaleDateString("sv-SE"),
            holiday: holidays.value[key],
        });
    }
    return rows;
});
function key(s: Schedule) {
    return `${s.scheduleMonth}|${s.startDateTime}`;
}
function label(s: Schedule) {
    return s.eventType === "GAME"
        ? s.competitionName || "試合"
        : s.eventType === "MEETING"
          ? "会議"
          : "練習";
}
async function open(item: Schedule) {
    editing.value = false;
    message.value = "";
    try {
        selected.value = await fetchScheduleDetail(item);
    } catch {
        selected.value = item;
    }
    attendance.value = await fetchAttendance(item).catch(() => null);
    guestCount.value = attendance.value?.currentGuestCount || 0;
    comment.value = attendance.value?.currentComment || "";
}
function close() {
    selected.value = null;
    editing.value = false;
}
async function answer(status: AttendanceStatus) {
    if (!selected.value) return;
    attendanceBusy.value = true;
    try {
        await saveAttendance(selected.value, status, guestCount.value, comment.value);
        attendance.value = await fetchAttendance(selected.value);
        await store.load(true);
    } finally {
        attendanceBusy.value = false;
    }
}
function startEdit() {
    if (!selected.value) return;
    Object.assign(edit, {
        date: selected.value.startDateTime.slice(0, 10),
        startTime: selected.value.startDateTime.slice(11, 16),
        endTime: selected.value.endDateTime.slice(11, 16),
        facilityId: selected.value.facilityId || "",
        eventType: selected.value.eventType,
        competitionName: selected.value.competitionName || "",
        round: selected.value.round || "",
        videoUrl: selected.value.videoUrl || "",
        videoTags: selected.value.videoTags || "",
    });
    editing.value = true;
}
async function saveEdit() {
    if (!selected.value) return;
    attendanceBusy.value = true;
    try {
        await updateSchedule({
            oldScheduleMonth: selected.value.scheduleMonth,
            oldStartDateTime: selected.value.startDateTime,
            ...edit,
        });
        message.value = "予定を更新しました";
        await store.load(true);
        const refreshed = store.schedules.find(
            (s) => s.startDateTime === `${edit.date}T${edit.startTime}`,
        );
        if (refreshed) await open(refreshed);
        editing.value = false;
    } catch (e) {
        message.value = e instanceof Error ? e.message : "更新できません";
    } finally {
        attendanceBusy.value = false;
    }
}
async function remove() {
    if (!selected.value || !confirm("この予定を削除しますか？")) return;
    try {
        await deleteSchedule(selected.value);
        close();
        await store.load(true);
    } catch (e) {
        message.value = e instanceof Error ? e.message : "削除できません";
    }
}
function move(offset: number) {
    month.value = new Date(month.value.getFullYear(), month.value.getMonth() + offset, 1);
    void loadHolidays(month.value.getFullYear());
}
async function loadHolidays(year: number) {
    try {
        const response = await fetch(`https://holidays-jp.shogo82148.com/${year}`);
        if (!response.ok) return;
        const data = (await response.json()) as {
            holidays?: Array<{ date: string; name: string }>;
        };
        holidays.value = Object.fromEntries(
            (data.holidays || []).map((item) => [item.date, item.name]),
        );
    } catch {
        holidays.value = {};
    }
}
function addAt(date: string) {
    if (auth.isAdmin) router.push({ name: "schedule-new", query: { date } });
}
async function saveBulk() {
    const entries = store.upcoming
        .filter((s) => bulk[key(s)])
        .map((s) => saveAttendance(s, bulk[key(s)] as AttendanceStatus));
    attendanceBusy.value = true;
    try {
        await Promise.all(entries);
        message.value = `${entries.length}件の出欠を保存しました`;
        bulkOpen.value = false;
        await store.load(true);
    } finally {
        attendanceBusy.value = false;
    }
}
async function copyLine() {
    await navigator.clipboard.writeText(lineTemplate(monthItems.value, month.value.getMonth() + 1));
    message.value = "LINE用の予定文をコピーしました";
}
onMounted(() => {
    void loadHolidays(month.value.getFullYear());
    return store.load();
});
</script>
<template>
    <section class="page-shell">
        <header class="page-hero">
            <div>
                <span class="eyebrow">TEAM CALENDAR</span>
                <h1>チームスケジュール</h1>
                <p>練習・試合・会議、出欠、参加人数をまとめて確認できます。</p>
            </div>
            <div class="hero-controls">
                <button class="secondary-button" type="button" @click="bulkOpen = true">
                    出欠をまとめて回答</button
                ><RouterLink v-if="auth.isAdmin" class="primary-button" to="/schedules/new"
                    >予定を登録</RouterLink
                >
            </div>
        </header>
        <section
            v-if="store.announcements.filter((i) => i.visible).length"
            class="announcement-strip"
        >
            <strong>チームへのお知らせ</strong>
            <article v-for="item in store.announcements.filter((i) => i.visible)" :key="item.id">
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
                <div>
                    <button type="button" @click="downloadCalendar(monthItems, monthKey)">
                        ICS</button
                    ><button type="button" @click="copyLine">LINE文</button
                    ><button type="button" @click="move(1)">→</button>
                </div>
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
                    :class="{ today: cell.today, holiday: cell.holiday, muted: !cell.day }"
                    @dblclick="cell.day && addAt(cell.key)"
                >
                    <b v-if="cell.day"
                        >{{ cell.day }}<small v-if="cell.holiday">{{ cell.holiday }}</small></b
                    ><button
                        v-for="item in cell.items"
                        :key="item.startDateTime"
                        type="button"
                        class="calendar-event"
                        :class="item.eventType.toLowerCase()"
                        @click.stop="open(item)"
                    >
                        <span>{{ label(item) }}</span
                        >{{ item.startDateTime.slice(11, 16) }}–{{ item.endDateTime.slice(11, 16) }}
                    </button>
                </div>
            </div>
            <p v-if="auth.isAdmin" class="calendar-hint">
                予定のない日をダブルクリックすると、その日付で予定登録を開きます。
            </p>
        </div>
        <p class="inline-status" role="status">{{ message }}</p>
        <section class="upcoming-section">
            <div class="section-heading">
                <span class="eyebrow">UPCOMING</span>
                <h2>今後の予定</h2>
            </div>
            <div class="event-list">
                <button
                    v-for="item in store.upcoming.slice(0, 20)"
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
                        ><strong>{{ label(item) }}</strong
                        ><small
                            >{{ item.startDateTime.slice(11, 16) }}–{{
                                item.endDateTime.slice(11, 16)
                            }}
                            · {{ item.facilityName || "施設未設定" }}</small
                        ></span
                    ><i
                        >参加 {{ item.attendanceTotal || 0 }}（ゲスト
                        {{ item.attendanceGuests || 0 }}） / 未定 {{ item.attendanceMaybe || 0 }}</i
                    >
                </button>
            </div>
        </section>
        <Teleport to="body"
            ><div v-if="selected" class="modal-backdrop" @click.self="close">
                <dialog open class="detail-modal">
                    <button class="modal-close" type="button" @click="close">×</button
                    ><template v-if="!editing"
                        ><span class="eyebrow">EVENT DETAIL</span>
                        <h2>{{ label(selected) }}</h2>
                        <dl>
                            <div>
                                <dt>日時</dt>
                                <dd>
                                    {{
                                        new Date(selected.startDateTime).toLocaleString("ja-JP")
                                    }}〜{{ selected.endDateTime.slice(11, 16) }}
                                </dd>
                            </div>
                            <div>
                                <dt>施設</dt>
                                <dd>{{ selected.facilityName || "未設定" }}</dd>
                            </div>
                            <div v-if="selected.address">
                                <dt>住所</dt>
                                <dd>{{ selected.address }}</dd>
                            </div>
                            <div v-if="selected.round">
                                <dt>ラウンド</dt>
                                <dd>{{ selected.round }}</dd>
                            </div>
                            <div v-if="selected.videoUrl">
                                <dt>動画</dt>
                                <dd>
                                    <a :href="selected.videoUrl" target="_blank"
                                        >YouTube等で開く ↗</a
                                    >
                                </dd>
                            </div>
                        </dl>
                        <div class="attendance-inputs">
                            <label
                                >ゲスト人数
                                <input
                                    v-model.number="guestCount"
                                    type="number"
                                    min="0"
                                    max="20" /></label
                            ><label>コメント <input v-model="comment" maxlength="100" /></label>
                        </div>
                        <div class="attendance-actions">
                            <p>この予定への参加</p>
                            <button
                                v-for="option in [
                                    { v: 'ATTENDING', l: '参加' },
                                    { v: 'MAYBE', l: '未定' },
                                    { v: 'ABSENT', l: '不参加' },
                                ]"
                                :key="option.v"
                                :class="{ selected: attendance?.currentStatus === option.v }"
                                :disabled="attendanceBusy"
                                type="button"
                                @click="answer(option.v as AttendanceStatus)"
                            >
                                {{ option.l }}
                            </button>
                        </div>
                        <p v-if="attendance" class="attendance-summary">
                            参加 {{ attendance.attending || 0 }}人 + ゲスト
                            {{ attendance.guests || 0 }}人 · 未定 {{ attendance.maybe || 0 }}人 ·
                            不参加 {{ attendance.absent || 0 }}人
                        </p>
                        <ul v-if="attendance?.participants?.length" class="participant-list">
                            <li v-for="p in attendance.participants" :key="p.userSub || p.username">
                                <strong>{{ p.displayName || p.username }}</strong
                                ><span
                                    >{{
                                        p.status === "ATTENDING"
                                            ? "参加"
                                            : p.status === "MAYBE"
                                              ? "未定"
                                              : "不参加"
                                    }}<template v-if="p.guestCount">
                                        +{{ p.guestCount }}名</template
                                    ></span
                                >
                            </li>
                        </ul>
                        <div v-if="auth.isAdmin" class="button-row">
                            <button type="button" @click="startEdit">編集</button
                            ><button class="danger-button" type="button" @click="remove">
                                削除
                            </button>
                        </div></template
                    >
                    <form v-else @submit.prevent="saveEdit">
                        <span class="eyebrow">EDIT EVENT</span>
                        <h2>予定を編集</h2>
                        <div class="form-grid">
                            <label
                                ><span>日付</span
                                ><input v-model="edit.date" type="date" required /></label
                            ><label
                                ><span>開始</span
                                ><input v-model="edit.startTime" type="time" required /></label
                            ><label
                                ><span>終了</span
                                ><input v-model="edit.endTime" type="time" required /></label
                            ><label
                                ><span>種別</span
                                ><select v-model="edit.eventType">
                                    <option value="PRACTICE">練習</option>
                                    <option value="GAME">試合</option>
                                    <option value="MEETING">会議</option>
                                </select></label
                            ><label class="wide"
                                ><span>施設</span
                                ><select v-model="edit.facilityId">
                                    <option
                                        v-for="f in store.facilities"
                                        :key="f.facilityId"
                                        :value="f.facilityId"
                                    >
                                        {{ f.facilityName }}
                                    </option>
                                </select></label
                            ><label
                                ><span>大会名</span><input v-model="edit.competitionName" /></label
                            ><label><span>ラウンド</span><input v-model="edit.round" /></label
                            ><label class="wide"
                                ><span>動画URL</span
                                ><input v-model="edit.videoUrl" type="url" /></label
                            ><label class="wide"
                                ><span>動画タグ</span><input v-model="edit.videoTags"
                            /></label>
                        </div>
                        <div class="form-footer">
                            <button type="button" @click="editing = false">キャンセル</button
                            ><button class="primary-button" type="submit">保存</button>
                        </div>
                    </form>
                </dialog>
            </div>
            <div v-if="bulkOpen" class="modal-backdrop" @click.self="bulkOpen = false">
                <dialog open class="detail-modal bulk-modal">
                    <button class="modal-close" type="button" @click="bulkOpen = false">×</button
                    ><span class="eyebrow">BULK ATTENDANCE</span>
                    <h2>今後の予定へまとめて回答</h2>
                    <p>回答する予定だけ選択してください。空欄は変更しません。</p>
                    <article v-for="item in store.upcoming" :key="key(item)" class="bulk-row">
                        <div>
                            <strong
                                >{{ new Date(item.startDateTime).toLocaleDateString("ja-JP") }} ·
                                {{ label(item) }}</strong
                            ><small>{{ item.facilityName }}</small>
                        </div>
                        <div class="segmented">
                            <label
                                v-for="option in [
                                    { v: 'ATTENDING', l: '参加' },
                                    { v: 'MAYBE', l: '未定' },
                                    { v: 'ABSENT', l: '不参加' },
                                ]"
                                :key="option.v"
                                ><input
                                    v-model="bulk[key(item)]"
                                    type="radio"
                                    :name="key(item)"
                                    :value="option.v"
                                /><span>{{ option.l }}</span></label
                            ><button type="button" @click="bulk[key(item)] = ''">解除</button>
                        </div>
                    </article>
                    <button
                        class="primary-button"
                        :disabled="attendanceBusy"
                        type="button"
                        @click="saveBulk"
                    >
                        選択した回答を保存
                    </button>
                </dialog>
            </div></Teleport
        >
    </section>
</template>
