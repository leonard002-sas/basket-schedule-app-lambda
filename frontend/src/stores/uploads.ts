import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { fetchImageJob, requestImageUpload, uploadImageToS3 } from "../services/api";
import type { ImageJob } from "../types/domain";

const STORAGE_KEY = "basket_image_jobs_v2";
const TERMINAL = new Set(["COMPLETED", "FAILED", "UNAVAILABLE"]);

function restore(): ImageJob[] {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]") as ImageJob[];
    } catch {
        return [];
    }
}

export const useUploadStore = defineStore("uploads", () => {
    const jobs = ref<ImageJob[]>(restore());
    const active = computed(() => jobs.value.filter((job) => !TERMINAL.has(job.status)));
    let timer: number | undefined;

    function persist(): void {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.value));
    }
    function replace(job: ImageJob): void {
        const index = jobs.value.findIndex((item) => item.jobId === job.jobId);
        if (index >= 0) jobs.value[index] = job;
        else jobs.value.unshift(job);
        persist();
    }
    async function refresh(): Promise<void> {
        for (const job of active.value) {
            try {
                replace({ ...(await fetchImageJob(job.jobId)), fileName: job.fileName });
            } catch {
                // 一時的な通信失敗ではジョブを失敗扱いにせず、次の確認を待ちます。
            }
        }
        if (!active.value.length && timer) {
            window.clearInterval(timer);
            timer = undefined;
        }
    }
    function watch(): void {
        if (!timer && active.value.length) timer = window.setInterval(refresh, 3000);
    }
    async function start(file: File): Promise<void> {
        const ticket = await requestImageUpload(file);
        const job: ImageJob = { jobId: ticket.fileName, fileName: file.name, status: "UPLOADING" };
        replace(job);
        try {
            await uploadImageToS3(ticket.uploadUrl, file);
            replace({ ...job, status: "QUEUED", stage: "WAITING" });
            watch();
        } catch (cause) {
            replace({
                ...job,
                status: "FAILED",
                message: cause instanceof Error ? cause.message : "アップロードに失敗しました",
            });
            throw cause;
        }
    }
    function dismiss(jobId: string): void {
        jobs.value = jobs.value.filter((job) => job.jobId !== jobId);
        persist();
    }
    function initialize(): void {
        watch();
        void refresh();
    }
    return { jobs, active, start, dismiss, initialize };
});
