/** 予定の詳細表示、施設情報、管理者向け編集操作を担当します。 */

const scheduleDetailModal = document.getElementById("scheduleDetailModal");

const closeScheduleDetailButton = document.getElementById("closeScheduleDetailButton");

const closeScheduleDetailButtonBottom = document.getElementById("closeScheduleDetailButtonBottom");

const editScheduleButton = document.getElementById("editScheduleButton");

const deleteScheduleButton = document.getElementById("deleteScheduleButton");

// 編集画面の要素はブラウザーの暗黙のIDグローバルではなく、明示的に取得します。
const scheduleViewMode = document.getElementById("scheduleViewMode");
const scheduleEditMode = document.getElementById("scheduleEditMode");
const viewModeButtons = document.getElementById("viewModeButtons");
const editModeButtons = document.getElementById("editModeButtons");
const editDate = document.getElementById("editDate");
const editStartTime = document.getElementById("editStartTime");
const editEndTime = document.getElementById("editEndTime");
const editFacilityId = document.getElementById("editFacilityId");
const editDayOfWeek = document.getElementById("editDayOfWeek");
const saveScheduleButton = document.getElementById("saveScheduleButton");

const startBasketballButton = document.getElementById("startBasketballButton");
if (startBasketballButton) {
    startBasketballButton.addEventListener("click", () => {
        if (!currentScheduleDetail) return;
        const params = new URLSearchParams({
            view: "games",
            date: String(currentScheduleDetail.startDateTime || "").slice(0, 10),
            scheduleMonth: currentScheduleDetail.scheduleMonth || "",
            startDateTime: currentScheduleDetail.startDateTime || "",
        });
        location.href = `basketball.html?${params}`;
    });
}

// ========================================
// 詳細ダイアログを閉じる
// ========================================

function closeScheduleDetail() {
    scheduleDetailModal.classList.remove("active");
}

// ========================================
// 詳細APIから予定取得
// ========================================
async function showScheduleDetail(schedule) {
    try {
        const params = new URLSearchParams({
            scheduleMonth: schedule.scheduleMonth,

            startDateTime: schedule.startDateTime,
        });

        const response = await authenticatedFetch(`${API_URL}?${params.toString()}`, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error("予定詳細APIエラー: " + response.status);
        }

        const detail = await response.json();

        console.log("予定詳細:", detail);

        currentScheduleDetail = detail;

        // ========================================
        // 日時
        // ========================================

        const start = new Date(detail.startDateTime);

        const end = new Date(detail.endDateTime);

        document.getElementById("detailDate").textContent =
            `${start.getFullYear()}年` + `${start.getMonth() + 1}月` + `${start.getDate()}日`;

        document.getElementById("detailEventType").textContent =
            detail.eventType === "GAME" ? "試合" : detail.eventType === "MEETING" ? "会議" : "練習";
        const competitionRow = document.getElementById("detailCompetitionRow");
        const roundRow = document.getElementById("detailRoundRow");
        document.getElementById("detailCompetition").textContent = detail.competitionName || "";
        document.getElementById("detailRound").textContent = detail.round || "";
        competitionRow.hidden = detail.eventType !== "GAME" || !detail.competitionName;
        roundRow.hidden = detail.eventType !== "GAME" || !detail.round;
        const eventVideoRow = document.getElementById("detailEventVideoRow");
        const eventVideo = document.getElementById("detailEventVideo");
        eventVideoRow.hidden = !detail.videoUrl;
        if (detail.videoUrl) eventVideo.href = detail.videoUrl;
        else eventVideo.removeAttribute("href");
        const videoTags = String(detail.videoTags || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        document.getElementById("detailVideoTags").textContent = videoTags.join(" · ");
        document.getElementById("detailVideoTagsRow").hidden = videoTags.length === 0;

        document.getElementById("detailDayOfWeek").textContent = detail.dayOfWeek;

        document.getElementById("detailStartTime").textContent = formatTime(start);

        document.getElementById("detailEndTime").textContent = formatTime(end);

        // ========================================
        // 施設
        // ========================================

        document.getElementById("detailFacilityName").textContent = detail.facilityName || "未設定";

        const detailFacility = facilities.find((item) => item.facilityId === detail.facilityId);
        const facilityNoteRow = document.getElementById("detailFacilityNoteRow");
        const facilityNote = document.getElementById("detailFacilityNote");
        if (facilityNoteRow && facilityNote) {
            facilityNote.textContent = detailFacility?.note || "";
            facilityNoteRow.hidden = !detailFacility?.note;
        }

        document.getElementById("detailAddress").textContent = detail.address || "未設定";

        const facilityUrl = document.getElementById("detailFacilityUrl");

        if (detail.url) {
            facilityUrl.href = detail.url;

            facilityUrl.style.display = "inline";
        } else {
            facilityUrl.removeAttribute("href");

            facilityUrl.style.display = "none";
        }

        // ========================================
        // 管理者ボタン表示
        // ========================================

        // Decoded browser claims only control button visibility; Java APIs verify authorization.
        const isAdmin = isCalendarAdmin();

        if (editScheduleButton) {
            editScheduleButton.style.display = isAdmin ? "inline-block" : "none";
        }

        if (deleteScheduleButton) {
            deleteScheduleButton.style.display = isAdmin ? "inline-block" : "none";
        }

        if (startBasketballButton) {
            startBasketballButton.style.display =
                isAdmin && detail.eventType === "GAME" ? "inline-block" : "none";
        }

        scheduleDetailModal.classList.add("active");
    } catch (error) {
        console.error("予定詳細取得エラー:", error);

        alert("予定詳細の取得に失敗しました。");
    }
}

// ========================================
// 閉じるボタン
// ========================================

if (closeScheduleDetailButton) {
    closeScheduleDetailButton.addEventListener("click", closeScheduleDetail);
}

if (closeScheduleDetailButtonBottom) {
    closeScheduleDetailButtonBottom.addEventListener("click", closeScheduleDetail);
}

// ========================================
// 背景クリックで閉じる
// ========================================

if (scheduleDetailModal) {
    scheduleDetailModal.addEventListener("click", (event) => {
        if (event.target === scheduleDetailModal) {
            closeScheduleDetail();
        }
    });
}

// ========================================
// 予定削除
// ========================================

if (deleteScheduleButton) {
    deleteScheduleButton.addEventListener("click", async () => {
        if (!currentScheduleDetail) {
            return;
        }

        const confirmed = window.confirm("この予定を削除しますか？");

        if (!confirmed) {
            return;
        }

        try {
            deleteScheduleButton.disabled = true;

            const response = await authenticatedFetch(API_URL, {
                method: "DELETE",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    scheduleMonth: currentScheduleDetail.scheduleMonth,

                    startDateTime: currentScheduleDetail.startDateTime,
                }),
            });

            const result = await response.json();

            console.log("削除APIレスポンス:", result);

            if (!response.ok) {
                throw new Error(result.message || "削除に失敗しました");
            }

            alert("予定を削除しました。");

            closeScheduleDetail();

            await loadSchedule();
        } catch (error) {
            console.error("予定削除エラー:", error);

            alert("予定の削除に失敗しました。\n" + error.message);
        } finally {
            deleteScheduleButton.disabled = false;
        }
    });
}

// ========================================
// 編集ボタン
// ========================================

if (editScheduleButton) {
    editScheduleButton.addEventListener("click", async () => {
        if (!currentScheduleDetail) {
            return;
        }

        if (facilities.length === 0) {
            await loadFacilities();
        }

        enterEditMode();
    });
}

// ========================================
// 編集用施設プルダウン作成
// ========================================

function prepareEditFacilityOptions() {
    if (!editFacilityId) {
        return;
    }

    editFacilityId.innerHTML = "";

    const defaultOption = document.createElement("option");

    defaultOption.value = "";

    defaultOption.textContent = "施設を選択してください";

    editFacilityId.appendChild(defaultOption);

    facilities.forEach((facility) => {
        const option = document.createElement("option");

        option.value = facility.facilityId;

        option.textContent = facility.facilityName;

        editFacilityId.appendChild(option);
    });

    console.log("編集用施設プルダウン:", facilities);
}

// ========================================
// 施設変更時の情報更新
// ========================================

function updateEditFacilityInfo() {
    if (!editFacilityId) {
        return;
    }

    const selectedFacility = facilities.find(
        (facility) => facility.facilityId === editFacilityId.value,
    );

    if (!selectedFacility) {
        const editFacilityNote = document.getElementById("editFacilityNote");
        if (editFacilityNote) editFacilityNote.textContent = "";

        if (editAddress) {
            editAddress.textContent = "未設定";
        }

        if (editFacilityUrl) {
            editFacilityUrl.removeAttribute("href");

            editFacilityUrl.style.display = "none";
        }

        return;
    }

    const editFacilityNote = document.getElementById("editFacilityNote");
    if (editFacilityNote) editFacilityNote.textContent = selectedFacility.note || "";

    // ========================================
    // 住所
    // ========================================

    if (editAddress) {
        editAddress.textContent = selectedFacility.address || "未設定";
    }

    // ========================================
    // URL
    // ========================================

    if (editFacilityUrl) {
        if (selectedFacility.url) {
            editFacilityUrl.href = selectedFacility.url;

            editFacilityUrl.style.display = "inline";
        } else {
            editFacilityUrl.removeAttribute("href");

            editFacilityUrl.style.display = "none";
        }
    }
}

// ========================================
// 施設マスタ取得
// ========================================

async function loadFacilities() {
    try {
        const response = await authenticatedFetch(FACILITY_API_URL);

        if (!response.ok) {
            throw new Error("施設APIエラー: " + response.status);
        }

        facilities = await response.json();
        renderHomeAgenda();

        console.log("施設マスタ:", facilities);

        // 編集用施設プルダウンを作成
        prepareEditFacilityOptions();
    } catch (error) {
        console.error("施設取得エラー:", error);
    }
}

// ========================================
// 施設変更
// ========================================

if (editFacilityId) {
    editFacilityId.addEventListener("change", () => {
        console.log("選択された施設:", editFacilityId.value);

        updateEditFacilityInfo();
    });
}

// ========================================
// 編集モード開始
// ========================================

function enterEditMode() {
    if (!currentScheduleDetail) {
        return;
    }

    // ========================================
    // 閲覧モード → 編集モード
    // ========================================

    if (scheduleViewMode) {
        scheduleViewMode.style.display = "none";
    }

    if (scheduleEditMode) {
        scheduleEditMode.style.display = "block";
    }

    if (viewModeButtons) {
        viewModeButtons.style.display = "none";
    }

    if (editModeButtons) {
        editModeButtons.style.display = "block";
    }

    // ========================================
    // 既存値を設定
    // ========================================

    const startDateTime = currentScheduleDetail.startDateTime;

    const endDateTime = currentScheduleDetail.endDateTime;

    document.getElementById("editEventType").value = ["GAME", "MEETING"].includes(
        currentScheduleDetail.eventType,
    )
        ? currentScheduleDetail.eventType
        : "PRACTICE";
    document.getElementById("editCompetitionName").value =
        currentScheduleDetail.competitionName || "";
    document.getElementById("editRound").value = currentScheduleDetail.round || "";
    document.getElementById("editVideoUrl").value = currentScheduleDetail.videoUrl || "";
    document.getElementById("editVideoTags").value = currentScheduleDetail.videoTags || "";
    updateScheduleGameFields();

    if (editDate) {
        editDate.value = startDateTime.substring(0, 10);
    }

    if (editStartTime) {
        editStartTime.value = startDateTime.substring(11, 16);
    }

    if (editEndTime) {
        editEndTime.value = endDateTime.substring(11, 16);
    }

    // ========================================
    // 施設
    // ========================================

    if (editFacilityId) {
        editFacilityId.value = currentScheduleDetail.facilityId;
    }

    // ========================================
    // 曜日
    // ========================================

    updateEditDayOfWeek();

    // ========================================
    // 施設情報
    // ========================================

    updateEditFacilityInfo();

    console.log("=== 編集モード開始 ===");
}

/** 選択中の予定種別に合わせて大会名とラウンド欄の表示を切り替えます。 */
function updateScheduleGameFields() {
    const isGame = document.getElementById("editEventType")?.value === "GAME";
    document.getElementById("editCompetitionRow").hidden = !isGame;
    document.getElementById("editRoundRow").hidden = !isGame;
}

document.getElementById("editEventType")?.addEventListener("change", updateScheduleGameFields);

// ========================================
// 保存
// ========================================

if (saveScheduleButton) {
    saveScheduleButton.addEventListener("click", async () => {
        if (!currentScheduleDetail) {
            console.error("currentScheduleDetail がありません");

            return;
        }

        const date = editDate.value;

        const startTime = editStartTime.value;

        const endTime = editEndTime.value;

        const facilityId = editFacilityId.value;

        console.log("=== 保存開始 ===");

        console.log("日付:", date);

        console.log("開始:", startTime);

        console.log("終了:", endTime);

        console.log("施設:", facilityId);

        // ========================================
        // 入力チェック
        // ========================================

        if (!date) {
            alert("日付を入力してください。");

            return;
        }

        if (!startTime) {
            alert("開始時間を入力してください。");

            return;
        }

        if (!endTime) {
            alert("終了時間を入力してください。");

            return;
        }

        if (!facilityId) {
            alert("施設を選択してください。");

            return;
        }

        if (endTime <= startTime) {
            alert("終了時間は開始時間より後にしてください。");

            return;
        }

        try {
            saveScheduleButton.disabled = true;

            saveScheduleButton.textContent = "保存中...";

            // ========================================
            // PUT
            // ========================================

            const response = await authenticatedFetch(API_URL, {
                method: "PUT",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    oldScheduleMonth: currentScheduleDetail.scheduleMonth,

                    oldStartDateTime: currentScheduleDetail.startDateTime,

                    date: date,

                    startTime: startTime,

                    endTime: endTime,

                    facilityId: facilityId,

                    eventType: document.getElementById("editEventType").value,

                    competitionName: document.getElementById("editCompetitionName").value.trim(),

                    round: document.getElementById("editRound").value.trim(),

                    videoUrl: document.getElementById("editVideoUrl").value.trim(),

                    videoTags: document
                        .getElementById("editVideoTags")
                        .value.split(",")
                        .map((tag) => tag.trim())
                        .filter(Boolean)
                        .slice(0, 6)
                        .join(", "),
                }),
            });

            const result = await response.json();

            console.log("更新APIレスポンス:", result);

            if (!response.ok) {
                throw new Error(result.message || "更新に失敗しました");
            }

            // ========================================
            // 成功
            // ========================================

            alert("予定を更新しました。");

            // ========================================
            // 最新データ再取得
            // ========================================

            await loadSchedule();

            // ========================================
            // 編集モード終了
            // ========================================

            exitEditMode();

            // ========================================
            // 更新後の予定を検索
            // ========================================

            const newStartDateTime = `${date}T${startTime}`;

            const updatedSchedule = schedules.find(
                (schedule) => schedule.startDateTime === newStartDateTime,
            );

            if (updatedSchedule) {
                await showScheduleDetail(updatedSchedule);
            } else {
                closeScheduleDetail();
            }
        } catch (error) {
            console.error("予定更新エラー:", error);

            alert("予定の更新に失敗しました。\n" + error.message);
        } finally {
            saveScheduleButton.disabled = false;

            saveScheduleButton.textContent = "保存";
        }
    });
}

// ========================================
// 曜日更新
// ========================================

function updateEditDayOfWeek() {
    if (!editDate || !editDayOfWeek) {
        return;
    }

    if (!editDate.value) {
        editDayOfWeek.textContent = "";

        return;
    }

    const date = new Date(editDate.value + "T00:00:00");

    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

    editDayOfWeek.textContent = weekdays[date.getDay()];
}

// ========================================
// 編集モード終了
// ========================================

function exitEditMode() {
    if (scheduleViewMode) {
        scheduleViewMode.style.display = "block";
    }

    if (scheduleEditMode) {
        scheduleEditMode.style.display = "none";
    }

    if (viewModeButtons) {
        viewModeButtons.style.display = "block";
    }

    if (editModeButtons) {
        editModeButtons.style.display = "none";
    }
}
