/** 施設、予定、画像の登録を行う管理者向け画面の処理です。 */
// ========================================
// 施設API
// ========================================

const FACILITY_API_URL =
    "https://wybpjskbmgh6jbra4647ethnhm0pkulf.lambda-url.ap-northeast-1.on.aws/";

// ========================================
// 手入力登録API
// ========================================

const SCHEDULE_REGISTER_API_URL =
    "https://z7gedcbjogrjl7ld4o6rcj7dte0cjklf.lambda-url.ap-northeast-1.on.aws/";

const EXISTING_SCHEDULES_API_URL =
    "https://7yxh3p2c5swyx6ajv45ldmiswe0tirop.lambda-url.ap-northeast-1.on.aws/";

// ========================================
// 画像アップロードAPI
// ========================================

function getAdminIdToken() {
    const token = localStorage.getItem("id_token");
    if (!token) {
        return null;
    }

    try {
        const encodedPayload = token.split(".")[1];
        const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));

        if (!payload.exp || payload.exp * 1000 <= Date.now()) {
            throw new Error("ログインの有効期限が切れています");
        }
        if (
            !Array.isArray(payload["cognito:groups"]) ||
            !payload["cognito:groups"].includes("admins")
        )
            return null;
        return token;
    } catch (error) {
        localStorage.removeItem("id_token");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return null;
    }
}

/** 管理者用APIへIDトークンを付けて送信し、期限切れも共通処理します。 */
async function adminFetch(url, options = {}) {
    const token = getAdminIdToken();
    if (!token) {
        window.location.replace("index.html");
        throw new Error("管理者ログインが必要です。");
    }

    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });
}

/** 施設編集または予定登録の作業画面を表示します。 */
function showRegistrationScreen(screen, updateUrl = true) {
    const showingFacility = screen === "facility";
    document.getElementById("facilityRegistrationCard").hidden = !showingFacility;
    document.getElementById("manualRegistrationCard").hidden = showingFacility;
    document.getElementById("imageUploadCard").hidden = showingFacility;
    document.querySelector(".admin-page-heading h1").textContent = showingFacility
        ? "施設を登録"
        : "予定を登録";

    document
        .querySelectorAll(
            '.site-navigation [data-app-nav="schedule"], .site-navigation [data-app-nav="facility"]',
        )
        .forEach((link) => {
            if (link.dataset.appNav === screen) link.setAttribute("aria-current", "page");
            else link.removeAttribute("aria-current");
        });

    if (updateUrl) {
        const params = new URLSearchParams(location.search);
        params.set("screen", showingFacility ? "facility" : "schedule");
        history.pushState({ screen: params.get("screen") }, "", `register.html?${params}`);
    }
}

document.querySelectorAll(".site-navigation [data-registration-screen]").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        showRegistrationScreen(link.dataset.registrationScreen);
    });
});

window.addEventListener("popstate", () => {
    showRegistrationScreen(
        new URLSearchParams(location.search).get("screen") === "facility" ? "facility" : "schedule",
        false,
    );
});

// ========================================
// 施設マスタ
// ========================================

let facilities = [];

const facilityRegisterForm = document.getElementById("facilityRegisterForm");
const facilityRegisterButton = document.getElementById("facilityRegisterButton");
const facilityStatus = document.getElementById("facilityStatus");

if (facilityRegisterForm) {
    facilityRegisterForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = new FormData(facilityRegisterForm);
        const payload = {
            facilityName: String(form.get("facilityName") || "").trim(),
            address: String(form.get("address") || "").trim(),
            url: String(form.get("url") || "").trim(),
            note: String(form.get("note") || "").trim(),
        };
        facilityRegisterButton.disabled = true;
        facilityStatus.textContent = "施設を登録しています...";
        try {
            const response = await adminFetch(FACILITY_API_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.message || "施設を登録できませんでした");
            }
            facilityRegisterForm.reset();
            await loadFacilities();
            facilityStatus.textContent = `${result.facilityName}を登録しました。`;
        } catch (error) {
            facilityStatus.textContent = `登録エラー: ${error.message}`;
        } finally {
            facilityRegisterButton.disabled = false;
        }
    });
}

// ========================================
// 施設マスタ取得
// ========================================

async function loadFacilities() {
    try {
        const response = await adminFetch(FACILITY_API_URL);

        if (!response.ok) {
            throw new Error("施設APIエラー: " + response.status);
        }

        facilities = await response.json();

        console.log("取得した施設:", facilities);

        document.querySelectorAll(".facility-select").forEach((select) => {
            setFacilityOptions(select);
        });
    } catch (error) {
        console.error("施設取得エラー:", error);
    }
}

/** 既存の大会名をAPIから読み、予定登録欄の候補へ反映します。 */
async function loadCompetitionNames() {
    const list = document.getElementById("competitionNames");
    if (!list) return;
    try {
        const response = await adminFetch(EXISTING_SCHEDULES_API_URL);
        if (!response.ok) throw new Error(`大会一覧の取得に失敗しました: ${response.status}`);
        const payload = await response.json();
        const schedules = Array.isArray(payload) ? payload : payload.items || [];
        const names = [
            ...new Set(
                schedules
                    .filter((item) => item.eventType === "GAME")
                    .map((item) => String(item.competitionName || "").trim())
                    .filter(Boolean),
            ),
        ].sort((a, b) => a.localeCompare(b, "ja"));
        list.replaceChildren(
            ...names.map((name) => {
                const option = document.createElement("option");
                option.value = name;
                return option;
            }),
        );
    } catch (error) {
        console.warn("大会一覧を読み込めませんでした:", error);
    }
}

// ========================================
// 施設プルダウン作成
// ========================================

function setFacilityOptions(select) {
    select.innerHTML = "";

    const defaultOption = document.createElement("option");

    defaultOption.value = "";

    defaultOption.textContent = "施設を選択してください";

    select.appendChild(defaultOption);

    facilities.forEach((facility) => {
        const option = document.createElement("option");

        option.value = facility.facilityId;

        option.textContent = facility.facilityName;

        select.appendChild(option);
    });
}

// ========================================
// 予定入力
// ========================================

const scheduleRows = document.getElementById("scheduleRows");

const addScheduleButton = document.getElementById("addScheduleButton");

// ========================================
// 予定追加
// ========================================

if (addScheduleButton) {
    addScheduleButton.addEventListener("click", () => {
        const row = document.createElement("div");

        row.className = "schedule-row";

        row.innerHTML = `
                <select class="event-type-select" aria-label="予定種別">
                    <option value="PRACTICE">練習</option>
                    <option value="GAME">試合</option>
                    <option value="MEETING">会議</option>
                </select>

                <input
                    type="date"
                    class="date-input"
                >

                <input
                    type="time"
                    class="time-input"
                >

                <span>～</span>

                <input
                    type="time"
                    class="time-input"
                >

                <select
                    class="facility-select"
                >
                    <option value="">
                        施設を選択してください
                    </option>
                </select>

                <div class="schedule-row-actions"><button type="button" class="duplicate-button button-light">複製</button><button type="button" class="delete-button">削除</button></div>

                <label class="schedule-video-field">動画URL（任意）<input type="url" class="video-url-input" maxlength="2048" placeholder="YouTubeなどの共有リンク"></label>
                <label class="schedule-video-field">動画タグ（任意）<input type="text" class="video-tags-input" maxlength="120" list="videoTagOptions" placeholder="例：シュート、練習全体"></label>

                <div class="schedule-game-fields" hidden>
                    <label>大会名（登録済みから選択・新規入力）<input type="text" class="competition-name-input" maxlength="80" list="competitionNames" placeholder="例：2026秋北区大会"></label>
                    <label>ラウンド（任意）<input type="text" class="round-input" maxlength="40" list="basketballRoundOptions" placeholder="例：1回戦"></label>
                </div>
            `;

        scheduleRows.appendChild(row);

        const facilitySelect = row.querySelector(".facility-select");

        setFacilityOptions(facilitySelect);
    });
}

// ========================================
// 削除ボタン
// ========================================

if (scheduleRows) {
    const repeatCheckbox = document.getElementById("repeatWeekly"),
        repeatUntil = document.getElementById("repeatUntilDate");
    repeatCheckbox?.addEventListener("change", () => {
        repeatUntil.disabled = !repeatCheckbox.checked;
        if (repeatCheckbox.checked) repeatUntil.focus();
    });

    scheduleRows.addEventListener("change", (event) => {
        if (!event.target.matches(".event-type-select")) return;
        const row = event.target.closest(".schedule-row");
        const fields = row?.querySelector(".schedule-game-fields");
        if (!fields) return;
        fields.hidden = event.target.value !== "GAME";
        if (fields.hidden)
            fields.querySelectorAll("input").forEach((input) => {
                input.value = "";
            });
    });

    scheduleRows.addEventListener("click", (event) => {
        if (event.target.classList.contains("duplicate-button")) {
            const source = event.target.closest(".schedule-row");
            const clone = source.cloneNode(true);
            clone
                .querySelectorAll("input")
                .forEach(
                    (input, index) =>
                        (input.value = source.querySelectorAll("input")[index]?.value || ""),
                );
            clone
                .querySelectorAll("select")
                .forEach(
                    (select, index) =>
                        (select.value = source.querySelectorAll("select")[index]?.value || ""),
                );
            scheduleRows.insertBefore(clone, source.nextSibling);
            return;
        }

        if (event.target.classList.contains("delete-button")) {
            const row = event.target.closest(".schedule-row");

            if (row) {
                row.remove();
            }
        }
    });
}

// ========================================
// 手入力登録
// ========================================

const registerButton = document.getElementById("registerButton");

const status = document.getElementById("status");

if (registerButton) {
    registerButton.addEventListener("click", async () => {
        try {
            const rows = document.querySelectorAll(".schedule-row");

            const schedules = [];

            // ====================================
            // 入力値取得
            // ====================================

            rows.forEach((row) => {
                const date = row.querySelector(".date-input").value;

                const timeInputs = row.querySelectorAll(".time-input");

                const startTime = timeInputs[0].value;

                const endTime = timeInputs[1].value;

                const facilitySelect = row.querySelector(".facility-select");

                const facilityId = facilitySelect.value;

                const eventType = row.querySelector(".event-type-select").value;
                const competitionName =
                    row.querySelector(".competition-name-input")?.value.trim() || "";
                const round = row.querySelector(".round-input")?.value.trim() || "";
                const videoUrl = row.querySelector(".video-url-input")?.value.trim() || "";
                const videoTags =
                    row
                        .querySelector(".video-tags-input")
                        ?.value.split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 6) || [];

                const facilityName = facilitySelect.selectedOptions[0]?.textContent || "";

                const schedule = {
                    date: date,

                    startTime: startTime,

                    endTime: endTime,

                    facilityId: facilityId,

                    facilityName: facilityName,

                    eventType: eventType,

                    competitionName: eventType === "GAME" ? competitionName : "",

                    round: eventType === "GAME" ? round : "",

                    videoUrl,
                    videoTags,
                };
                schedules.push(schedule);
            });

            const repeatWeekly = document.getElementById("repeatWeekly")?.checked;
            if (repeatWeekly) {
                const until = document.getElementById("repeatUntilDate")?.value;
                if (!until) throw new Error("繰り返し終了日を入力してください");
                const expanded = [];
                for (const schedule of schedules) {
                    const cursor = new Date(`${schedule.date}T12:00:00`);
                    const end = new Date(`${until}T12:00:00`);
                    if (end < cursor) throw new Error("繰り返し終了日は開始日以降にしてください");
                    let count = 0;
                    while (cursor <= end) {
                        expanded.push({
                            ...schedule,
                            date: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
                        });
                        cursor.setDate(cursor.getDate() + 7);
                        count++;
                        if (count > 52) throw new Error("繰り返し登録は1予定につき52回までです");
                    }
                }
                if (expanded.length > 100) throw new Error("一度に登録できる予定は100件までです");
                schedules.splice(0, schedules.length, ...expanded);
            }

            console.log("登録する予定:", schedules);

            // ====================================
            // 入力チェック
            // ====================================

            for (const schedule of schedules) {
                if (!schedule.date) {
                    throw new Error("日付を入力してください");
                }

                if (!schedule.startTime) {
                    throw new Error("開始時間を入力してください");
                }

                if (!schedule.endTime) {
                    throw new Error("終了時間を入力してください");
                }

                if (!schedule.facilityId) {
                    throw new Error("施設を選択してください");
                }
            }

            if (schedules.length === 0) {
                throw new Error("登録する予定がありません");
            }

            // ====================================
            // 登録中
            // ====================================

            registerButton.disabled = true;

            if (status) {
                status.textContent = "登録中です...";
            }

            // ====================================
            // API呼び出し
            // ====================================

            const response = await adminFetch(SCHEDULE_REGISTER_API_URL, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    schedules: schedules,
                }),
            });

            const result = await response.json();

            console.log("登録APIレスポンス:", result);

            if (!response.ok) {
                throw new Error(result.message || "登録に失敗しました");
            }

            if (status) {
                status.textContent = schedules.length + "件の予定を登録しました。";
            }
        } catch (error) {
            console.error("登録エラー:", error);

            if (status) {
                status.textContent = "登録エラー: " + error.message;
            }
        } finally {
            registerButton.disabled = false;
        }
    });
}

// ========================================
// 初期処理
// ========================================

if (getAdminIdToken()) {
    document.body.classList.remove("auth-pending");
    const initialScreen =
        new URLSearchParams(location.search).get("screen") === "facility" ? "facility" : "schedule";
    showRegistrationScreen(initialScreen, false);
    loadFacilities();
    loadCompetitionNames();
} else {
    window.location.replace("index.html");
}
