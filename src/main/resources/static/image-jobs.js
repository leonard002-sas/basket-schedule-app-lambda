(() => {
    const API_URL = "https://gg5d4xxwdpfjdesh2n5vyxqm5q0mnwii.lambda-url.ap-northeast-1.on.aws/";
    const STORAGE_KEY = "basketScheduleImageJobs";
    const banner = document.getElementById("imageJobBanner");
    const list = document.getElementById("imageJobList");
    const dismissButton = document.getElementById("imageJobDismiss");
    const terminalStates = new Set(["COMPLETED", "FAILED", "UNAVAILABLE"]);
    let polling = false;

    function getJobs() {
        try {
            const jobs = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
            return Array.isArray(jobs) ? jobs : [];
        } catch {
            return [];
        }
    }

    function saveJobs(jobs) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(jobs.slice(-6)));
        render();
    }

    function updateJob(jobId, changes) {
        const jobs = getJobs();
        const index = jobs.findIndex(job => job.jobId === jobId);
        if (index < 0) return;
        jobs[index] = { ...jobs[index], ...changes, updatedAt: Date.now() };
        saveJobs(jobs);
    }

    function restoreInterruptedUploads() {
        const jobs = getJobs();
        let changed = false;
        for (const job of jobs) {
            if (job.status === "UPLOADING") {
                job.status = "QUEUED";
                job.stage = "WAITING";
                job.percent = 100;
                changed = true;
            }
        }
        if (changed) saveJobs(jobs);
    }

    function stateText(job) {
        if (job.status === "UPLOADING") return `画像をアップロード中 · ${Math.round(job.percent || 0)}%`;
        if (job.status === "QUEUED") return "解析の開始を待っています";
        if (job.status === "PROCESSING" && job.stage === "SAVING") {
            return `予定を登録中 · ${job.completed || 0}/${job.total || 0}件`;
        }
        if (job.status === "PROCESSING") return "Geminiで画像を解析しています";
        if (job.status === "COMPLETED") return `登録完了 · ${job.total || 0}件の予定`;
        if (job.status === "FAILED") return "解析または登録に失敗しました";
        if (job.status === "UNAVAILABLE") return job.message || "処理状況を取得できません";
        return "画像を処理しています";
    }

    function badgeText(status) {
        return ({
            UPLOADING: "アップロード",
            QUEUED: "準備中",
            PROCESSING: "処理中",
            COMPLETED: "完了",
            FAILED: "要確認",
            UNAVAILABLE: "状態不明"
        })[status] || "処理中";
    }

    function render() {
        if (!banner || !list) return;
        const jobs = getJobs();
        banner.hidden = jobs.length === 0;
        if (banner.hidden) return;

        list.replaceChildren();
        for (const job of jobs) {
            const row = document.createElement("div");
            row.className = "image-job-row";

            const indicator = document.createElement("span");
            indicator.className = "image-job-indicator";
            indicator.setAttribute("aria-hidden", "true");
            indicator.textContent = job.status === "COMPLETED" ? "✓" : job.status === "FAILED" ? "!" : "◌";

            const copy = document.createElement("div");
            copy.className = "image-job-copy";
            const title = document.createElement("div");
            title.className = "image-job-title";
            title.textContent = job.fileName || job.jobId;
            const detail = document.createElement("div");
            detail.className = "image-job-detail";
            detail.textContent = stateText(job);
            copy.append(title, detail);

            const badge = document.createElement("span");
            badge.className = "image-job-state";
            badge.textContent = badgeText(job.status);
            if (job.status === "COMPLETED") badge.classList.add("is-done");
            if (job.status === "FAILED" || job.status === "UNAVAILABLE") badge.classList.add("is-error");

            row.append(indicator, copy, badge);
            list.append(row);

            const track = document.createElement("div");
            track.className = "image-job-track";
            const fill = document.createElement("div");
            fill.className = "image-job-fill";
            if (job.status === "UPLOADING") {
                fill.style.width = `${Math.max(2, Math.min(100, job.percent || 0))}%`;
            } else if (job.status === "PROCESSING" && job.stage === "SAVING" && job.total > 0) {
                fill.style.width = `${Math.min(100, Math.round((job.completed / job.total) * 100))}%`;
            } else if (job.status === "COMPLETED") {
                track.classList.add("is-complete");
            } else if (job.status === "FAILED" || job.status === "UNAVAILABLE") {
                track.classList.add("is-error");
            } else {
                track.classList.add("is-indeterminate");
            }
            track.append(fill);
            list.append(track);
        }

        const hasDismissibleJob = jobs.some(job => terminalStates.has(job.status));
        if (dismissButton) dismissButton.hidden = !hasDismissibleJob;
    }

    function readAdminToken() {
        const token = localStorage.getItem("id_token");
        if (!token) return null;
        try {
            const payloadPart = token.split(".")[1];
            const base64 = payloadPart.replace(/-/g, "+").replace(/_/g, "/");
            const claims = JSON.parse(atob(base64 + "=".repeat((4 - base64.length % 4) % 4)));
            if (claims.exp * 1000 <= Date.now()
                    || !Array.isArray(claims["cognito:groups"])
                    || !claims["cognito:groups"].includes("admins")) return null;
            return token;
        } catch {
            return null;
        }
    }

    async function poll() {
        if (polling) return;
        let jobs = getJobs().filter(job => !terminalStates.has(job.status) && job.status !== "UPLOADING");
        if (jobs.length === 0) return;
        const now = Date.now();
        for (const job of jobs) {
            if (now - (job.createdAt || job.updatedAt || now) > 20 * 60 * 1000) {
                updateJob(job.jobId, { status: "UNAVAILABLE", message: "処理状況の確認時間を超えました。カレンダーを確認してください" });
            }
        }
        jobs = jobs.filter(job => now - (job.createdAt || job.updatedAt || now) <= 20 * 60 * 1000);
        if (jobs.length === 0) return;
        const token = readAdminToken();
        if (!token) return;

        polling = true;
        try {
            await Promise.all(jobs.map(async job => {
                try {
                    const response = await fetch(`${API_URL}?jobId=${encodeURIComponent(job.jobId)}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (!response.ok) {
                        if (response.status === 401 || response.status === 403) {
                            updateJob(job.jobId, { status: "UNAVAILABLE", message: "管理者として再ログインしてください" });
                        } else if (response.status >= 500) {
                            updateJob(job.jobId, { status: "UNAVAILABLE", message: "処理状況を確認できません。管理者に確認してください" });
                        }
                        return;
                    }
                    const state = await response.json();
                    updateJob(job.jobId, {
                        status: state.status || "QUEUED",
                        stage: state.stage || "WAITING",
                        completed: Number(state.completed) || 0,
                        total: Number(state.total) || 0,
                        message: state.message || ""
                    });
                } catch {
                    // 一時的な通信失敗は次のポーリングで再試行する。
                }
            }));
        } finally {
            polling = false;
        }
    }

    window.BasketImageJobs = {
        start(jobId, fileName) {
            const jobs = getJobs().filter(job => job.jobId !== jobId);
            jobs.push({ jobId, fileName, status: "UPLOADING", percent: 0, createdAt: Date.now(), updatedAt: Date.now() });
            saveJobs(jobs);
        },
        uploadProgress(jobId, percent) {
            updateJob(jobId, { status: "UPLOADING", percent });
        },
        uploaded(jobId) {
            updateJob(jobId, { status: "QUEUED", stage: "WAITING", percent: 100 });
            poll();
        },
        failed(jobId, message) {
            updateJob(jobId, { status: "FAILED", message: message || "画像をアップロードできませんでした" });
        }
    };

    if (dismissButton) {
        dismissButton.addEventListener("click", () => {
            saveJobs(getJobs().filter(job => !terminalStates.has(job.status)));
        });
    }
    window.addEventListener("storage", render);
    restoreInterruptedUploads();
    render();
    window.setInterval(poll, 2500);
})();

