import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { fetchFacilities, fetchSchedules } from "../services/api";
import type { Announcement, Facility, Schedule } from "../types/domain";

export const useScheduleStore = defineStore("schedules", () => {
    const schedules = ref<Schedule[]>([]);
    const announcements = ref<Announcement[]>([]);
    const facilities = ref<Facility[]>([]);
    const loading = ref(false);
    const error = ref("");
    const loadedAt = ref(0);

    const upcoming = computed(() =>
        schedules.value
            .filter((item) => new Date(item.endDateTime).getTime() >= Date.now())
            .sort((a, b) => a.startDateTime.localeCompare(b.startDateTime)),
    );

    async function load(force = false): Promise<void> {
        if (!force && loadedAt.value && Date.now() - loadedAt.value < 60_000) return;
        loading.value = true;
        error.value = "";
        try {
            const [schedulePayload, facilityPayload] = await Promise.all([
                fetchSchedules(),
                fetchFacilities().catch(() => []),
            ]);
            schedules.value = schedulePayload.items ?? [];
            announcements.value = schedulePayload.announcements ?? [];
            facilities.value = facilityPayload;
            loadedAt.value = Date.now();
        } catch (cause) {
            error.value = cause instanceof Error ? cause.message : "予定を読み込めませんでした";
        } finally {
            loading.value = false;
        }
    }

    return { schedules, announcements, facilities, upcoming, loading, error, load };
});
