const API_URL = window.BasketScheduleConfig.apiUrl;

const UPLOAD_API_URL = window.BasketScheduleConfig.uploadApiUrl;

// ========================================
// 施設API
// ========================================

const FACILITY_API_URL = window.BasketScheduleConfig.facilityApiUrl;

const scheduleElement = document.getElementById("scheduleList");

const uploadButton = document.getElementById("uploadButton");

const imageInput = document.getElementById("imageFile");

const uploadStatus = document.getElementById("status");

const calendarElement = document.getElementById("calendar");

const calendarMonthElement = document.getElementById("calendarMonth");

const prevMonthButton = document.getElementById("prevMonth");

const nextMonthButton = document.getElementById("nextMonth");

const exportMonthCalendarButton = document.getElementById("exportMonthCalendar");
const copyMonthScheduleTextButton = document.getElementById("copyMonthScheduleText");

const calendarExportStatus = document.getElementById("calendarExportStatus");
const bulkAttendanceStatus = document.getElementById("bulkAttendanceStatus");
const bulkAttendanceModal = document.getElementById("bulkAttendanceModal");
const bulkAttendanceRows = document.getElementById("bulkAttendanceRows");
const bulkAttendanceDialogStatus = document.getElementById("bulkAttendanceDialogStatus");
const openBulkAttendanceButton = document.getElementById("openBulkAttendanceButton");
const closeBulkAttendanceButton = document.getElementById("closeBulkAttendanceButton");
const cancelBulkAttendanceButton = document.getElementById("cancelBulkAttendanceButton");
const saveBulkAttendanceButton = document.getElementById("saveBulkAttendanceButton");
let bulkAttendanceSelections = new Map();

let schedules = [];
let announcements = [];

const workspaceScreenIds = ["homeScreen", "announcementScreen", "videoScreen"];
function workspaceScreenFromUrl() {
    const route = new URLSearchParams(window.location.search).get("screen");
    return route === "announcements"
        ? "announcementScreen"
        : route === "videos"
          ? "videoScreen"
          : "homeScreen";
}
function workspaceRouteForScreen(screenId) {
    return screenId === "announcementScreen"
        ? "announcements"
        : screenId === "videoScreen"
          ? "videos"
          : "";
}
function showWorkspaceScreen(screenId, updateUrl = true) {
    workspaceScreenIds.forEach((id) => {
        const screen = document.getElementById(id);
        if (screen) screen.hidden = id !== screenId;
    });
    const route = workspaceRouteForScreen(screenId);
    const activeKey = route || "calendar";
    document.querySelectorAll(".site-navigation [data-app-nav]").forEach((link) => {
        if (link.dataset.appNav === activeKey) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
    const announcementLink = document.querySelector(
        '.site-navigation [data-app-nav="announcements"]',
    );
    if (announcementLink) announcementLink.hidden = !isCalendarAdmin();
    if (updateUrl) {
        const url = route ? `index.html?screen=${route}` : "index.html";
        history.pushState({ screenId }, "", url);
    }
    if (screenId === "videoScreen") renderVideoArchive();
}
document.getElementById("workspaceMenuButton")?.addEventListener("click", () => {
    const menu = document.getElementById("workspaceMenuList");
    const button = document.getElementById("workspaceMenuButton");
    menu.hidden = !menu.hidden;
    button.setAttribute("aria-expanded", String(!menu.hidden));
});
document.querySelectorAll(".site-navigation [data-workspace-screen]").forEach((link) => {
    link.addEventListener("click", (event) => {
        event.preventDefault();
        const screenId = link.dataset.workspaceScreen;
        if (screenId === "announcementScreen" && !isCalendarAdmin()) return;
        showWorkspaceScreen(screenId);
    });
});
window.addEventListener("popstate", () => showWorkspaceScreen(workspaceScreenFromUrl(), false));
document.addEventListener("click", (event) => {
    const menu = document.getElementById("workspaceMenuList");
    const wrapper = document.querySelector(".workspace-menu");
    if (menu && wrapper && !wrapper.contains(event.target)) {
        menu.hidden = true;
        document.getElementById("workspaceMenuButton")?.setAttribute("aria-expanded", "false");
    }
});

// 施設マスタ
let facilities = [];

// 現在開いている予定
let currentScheduleDetail = null;
const mainNavigation = document.querySelector(".site-navigation");
const initiallyRequestedScreen = workspaceScreenFromUrl();
showWorkspaceScreen(
    initiallyRequestedScreen === "announcementScreen" && !isCalendarAdmin()
        ? "homeScreen"
        : initiallyRequestedScreen,
    false,
);

// ========================================
// 現在表示している月
// ========================================

const initialToday = new Date();
let currentYear = initialToday.getFullYear();
let currentMonth = initialToday.getMonth() + 1;

// ========================================
// 祝日データ
// ========================================

// 年ごとに取得した祝日を保存
// 一度取得した年は再度APIを呼ばない
const holidayCache = {};
const holidayRequests = {};

// ========================================
// 祝日取得
// ========================================

async function loadHolidays(year) {
    // すでに取得済みならAPIを呼ばない
    if (holidayCache[year]) {
        return;
    }

    if (holidayRequests[year]) {
        return holidayRequests[year];
    }

    holidayRequests[year] = (async () => {
        try {
            const response = await fetch(`https://holidays-jp.shogo82148.com/${year}`);

            if (!response.ok) {
                throw new Error("祝日APIエラー: " + response.status);
            }

            const data = await response.json();
            holidayCache[year] = {};
            data.holidays.forEach((holiday) => {
                holidayCache[year][holiday.date] = holiday.name;
            });

            console.log(`${year}年の祝日を取得しました`, holidayCache[year]);
        } catch (error) {
            console.error(`${year}年の祝日取得に失敗しました`, error);
            // API取得に失敗してもカレンダー自体は表示できるようにする
            holidayCache[year] = {};
        }
    })();

    return holidayRequests[year];
}

// ========================================
// 日付キー作成
// ========================================

function getDateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ========================================
// 予定取得
// ========================================

async function loadSchedule() {
    const subject = getValidIdTokenClaims()?.sub || "anonymous";
    const cacheKey = `basket_schedule_cache_v2_${subject}`;
    const cached = localStorage.getItem(cacheKey);

    // 前回の結果を先に描画し、ネットワーク応答を待たずに画面を表示します。
    if (cached) {
        try {
            const snapshot = JSON.parse(cached);
            if (Date.now() - snapshot.savedAt < 10 * 60 * 1000 && Array.isArray(snapshot.items)) {
                schedules = snapshot.items;
                announcements = snapshot.announcements || [];
                schedules.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));
                renderAnnouncements();
                displayCalendar();
                displaySchedule();
                renderHomeAgenda();
                renderVideoArchive();
            }
        } catch (error) {
            localStorage.removeItem(cacheKey);
        }
    } else if (scheduleElement) {
        scheduleElement.innerHTML = '<p class="loading-state">予定を読み込んでいます…</p>';
    }

    try {
        const response = await authenticatedFetch(API_URL, {
            method: "GET",
        });

        if (!response.ok) {
            throw new Error("APIエラー: " + response.status);
        }

        const payload = await response.json();
        schedules = Array.isArray(payload) ? payload : payload.items || [];
        announcements = Array.isArray(payload) ? [] : payload.announcements || [];
        localStorage.setItem(
            cacheKey,
            JSON.stringify({ savedAt: Date.now(), items: schedules, announcements }),
        );
        renderAnnouncements();

        schedules.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

        if (exportMonthCalendarButton) {
            exportMonthCalendarButton.disabled = false;
        }

        displayCalendar();
        displaySchedule();
        renderHomeAgenda();
        renderVideoArchive();
    } catch (error) {
        console.error(error);

        scheduleElement.innerHTML = '<p class="error">予定の取得に失敗しました。</p>';
    }
}

function scheduleKind(schedule) {
    return schedule.eventType === "GAME"
        ? { label: "試合", icon: "🏀", className: "game" }
        : schedule.eventType === "MEETING"
          ? { label: "会議", icon: "📋", className: "meeting" }
          : { label: "練習", icon: "🏀", className: "practice" };
}

function agendaCard(schedule) {
    const start = new Date(schedule.startDateTime),
        end = new Date(schedule.endDateTime),
        kind = scheduleKind(schedule);
    const facility =
        facilities.find((item) => item.facilityId === schedule.facilityId)?.facilityName ||
        schedule.facilityName ||
        "施設未設定";
    const attendance =
        Number(schedule.attendanceTotal || 0) || Number(schedule.attendanceMaybe || 0)
            ? `<small class="agenda-attendance">参加 ${schedule.attendanceTotal || 0}人 · 未定 ${schedule.attendanceMaybe || 0}人</small>`
            : "";
    return `<article class="agenda-event agenda-${kind.className}"><span class="agenda-type">${kind.icon} ${kind.label}</span><strong>${formatDate(start)}</strong><span>${formatTime(start)}〜${formatTime(end)}</span><span class="agenda-facility">${escapeHtml(facility)}</span>${attendance}${schedule.competitionName ? `<small>${escapeHtml(schedule.competitionName)}${schedule.round ? ` · ${escapeHtml(schedule.round)}` : ""}</small>` : ""}</article>`;
}

function renderHomeAgenda() {
    const todayBox = document.getElementById("todayAgendaList"),
        weekBox = document.getElementById("weekAgendaList");
    if (!todayBox || !weekBox) return;
    const now = new Date(),
        today = new Date(now.getFullYear(), now.getMonth(), now.getDate()),
        end = new Date(today);
    end.setDate(end.getDate() + 7);
    const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const todayItems = schedules.filter((s) => String(s.startDateTime).slice(0, 10) === todayKey);
    const weekItems = schedules.filter((s) => {
        const d = new Date(s.startDateTime);
        return d >= today && d < end;
    });
    todayBox.innerHTML = todayItems.length
        ? todayItems.map(agendaCard).join("")
        : "<p class='agenda-empty'>今日は予定がありません。よい一日を(^▽^)/</p>";
    weekBox.innerHTML = weekItems.length
        ? weekItems.map(agendaCard).join("")
        : "<p class='agenda-empty'>今週の予定はありません。</p>";
}

function renderVideoArchive() {
    const list = document.getElementById("videoArchiveList"),
        filter = document.getElementById("videoTagFilter");
    if (!list || !filter) return;
    const videos = schedules
        .filter((s) => s.videoUrl)
        .sort((a, b) => String(b.startDateTime).localeCompare(String(a.startDateTime)));
    const tags = [
        ...new Set(
            videos.flatMap((s) =>
                String(s.videoTags || "")
                    .split(",")
                    .map((t) => t.trim())
                    .filter(Boolean),
            ),
        ),
    ].sort((a, b) => a.localeCompare(b, "ja"));
    const selected = filter.value;
    filter.innerHTML = `<option value="">すべて</option>${tags.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("")}`;
    if (tags.includes(selected)) filter.value = selected;
    const shown = filter.value
        ? videos.filter((s) =>
              String(s.videoTags || "")
                  .split(",")
                  .map((t) => t.trim())
                  .includes(filter.value),
          )
        : videos;
    list.innerHTML = shown.length
        ? shown
              .map((s) => {
                  const type = scheduleKind(s),
                      date = new Date(s.startDateTime),
                      tags = String(s.videoTags || "")
                          .split(",")
                          .map((t) => t.trim())
                          .filter(Boolean),
                      venue =
                          facilities.find((f) => f.facilityId === s.facilityId)?.facilityName ||
                          s.facilityName;
                  return `<article class="video-archive-card"><div class="video-archive-meta"><span class="agenda-type">${type.icon} ${type.label}</span><time>${formatDate(date)}</time></div><h3>${escapeHtml(s.competitionName || venue || type.label + "の動画")}</h3><div class="video-tags">${tags.map((t) => `<span>${escapeHtml(t)}</span>`).join("")}</div><a href="${escapeHtml(s.videoUrl)}" target="_blank" rel="noopener noreferrer">動画を開く ↗</a></article>`;
              })
              .join("")
        : "<p class='agenda-empty'>このタグの動画はまだありません。</p>";
}

document.getElementById("videoTagFilter")?.addEventListener("change", renderVideoArchive);

function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
}

function isCalendarAdmin() {
    const groups = getValidIdTokenClaims()?.["cognito:groups"] || [];
    return groups.includes("admins") || groups.includes("root-admins");
}

function renderAnnouncements(admin = isCalendarAdmin()) {
    const area = document.getElementById("announcementsArea");
    const list = document.getElementById("announcementList");
    const active = announcements.filter((item) => item.visible);
    area.hidden = active.length === 0;
    document.getElementById("announcementCount").textContent = active.length
        ? `${active.length}件`
        : "";
    list.innerHTML = active
        .map(
            (item) =>
                `<article class="announcement-card urgency-${escapeHtml(item.urgency)}"><div class="announcement-meta"><span>${item.urgency === "URGENT" ? "緊急" : item.urgency === "IMPORTANT" ? "重要" : "お知らせ"}</span><span>${escapeHtml(item.visibleUntil)}まで</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.content).replace(/\n/g, "<br>")}</p></article>`,
        )
        .join("");
    const manager = document.getElementById("announcementManager");
    manager.hidden = !admin;
    const announcementMenuItem = document.querySelector(
        '.site-navigation [data-app-nav="announcements"]',
    );
    if (announcementMenuItem) announcementMenuItem.hidden = !admin;
    if (!admin) return;
    const adminList = document.getElementById("announcementAdminList");
    adminList.innerHTML = announcements.length
        ? announcements
              .map(
                  (item) =>
                      `<div class="announcement-admin-item${item.visible ? "" : " is-expired"}"><span><strong>${escapeHtml(item.title)}</strong><small>${item.visible ? `表示中 · ${escapeHtml(item.visibleUntil)}まで` : `期限切れ · ${escapeHtml(item.visibleUntil)}まで`}</small></span><span class="announcement-admin-actions"><button type="button" class="button-light" data-edit-announcement="${escapeHtml(item.id)}">編集</button><button type="button" class="button-danger" data-delete-announcement="${escapeHtml(item.id)}">削除</button></span></div>`,
              )
              .join("")
        : "<p class='announcement-empty'>周知事項はまだありません。</p>";
}

function resetAnnouncementForm() {
    const form = document.getElementById("announcementForm");
    form.reset();
    document.getElementById("announcementId").value = "";
    document.getElementById("cancelAnnouncementEdit").hidden = true;
    document.getElementById("announcementStatus").textContent = "";
}

document.getElementById("announcementForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const status = document.getElementById("announcementStatus");
    const payload = {
        id: document.getElementById("announcementId").value,
        title: document.getElementById("announcementTitle").value.trim(),
        content: document.getElementById("announcementContent").value.trim(),
        urgency: document.getElementById("announcementUrgency").value,
        visibleUntil: document.getElementById("announcementVisibleUntil").value,
    };
    status.textContent = "保存しています…";
    try {
        const response = await authenticatedFetch(`${API_URL}?resource=announcement`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || "保存できませんでした");
        resetAnnouncementForm();
        await loadSchedule();
        document.getElementById("announcementStatus").textContent = "周知事項を保存しました。";
    } catch (error) {
        status.textContent = error.message;
    }
});

document.getElementById("cancelAnnouncementEdit")?.addEventListener("click", resetAnnouncementForm);
document.getElementById("announcementAdminList")?.addEventListener("click", async (event) => {
    const edit = event.target.closest("[data-edit-announcement]");
    if (edit) {
        const item = announcements.find((row) => row.id === edit.dataset.editAnnouncement);
        if (!item) return;
        document.getElementById("announcementId").value = item.id;
        document.getElementById("announcementTitle").value = item.title;
        document.getElementById("announcementContent").value = item.content;
        document.getElementById("announcementUrgency").value = item.urgency;
        document.getElementById("announcementVisibleUntil").value = item.visibleUntil;
        document.getElementById("cancelAnnouncementEdit").hidden = false;
        document.getElementById("announcementTitle").focus();
        return;
    }
    const remove = event.target.closest("[data-delete-announcement]");
    if (!remove) return;
    const item = announcements.find((row) => row.id === remove.dataset.deleteAnnouncement);
    if (!item || !confirm(`「${item.title}」を削除しますか？`)) return;
    try {
        const response = await authenticatedFetch(
            `${API_URL}?resource=announcement&id=${encodeURIComponent(item.id)}`,
            { method: "DELETE" },
        );
        if (!response.ok) throw new Error("削除できませんでした");
        await loadSchedule();
    } catch (error) {
        alert(error.message);
    }
});

// ========================================
// カレンダー表示
// ========================================

function displayCalendar() {
    calendarElement.innerHTML = "";

    calendarMonthElement.textContent = `${currentYear}年${currentMonth}月`;

    // ========================================
    // 曜日
    // ========================================

    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

    weekdays.forEach((day) => {
        const element = document.createElement("div");

        element.className = "weekday";

        element.textContent = day;

        calendarElement.appendChild(element);
    });

    // ========================================
    // 月初の曜日
    // ========================================

    const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();

    // ========================================
    // 月の日数
    // ========================================

    const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();

    // ========================================
    // 月初までの空白
    // ========================================

    for (let i = 0; i < firstDay; i++) {
        const element = document.createElement("div");

        element.className = "calendar-day empty-day";

        calendarElement.appendChild(element);
    }

    // ========================================
    // 日付
    // ========================================

    for (let day = 1; day <= daysInMonth; day++) {
        const element = document.createElement("div");

        element.className = "calendar-day";

        const dayDate = new Date(currentYear, currentMonth - 1, day);

        const dayOfWeek = dayDate.getDay();

        const dateKey = getDateKey(currentYear, currentMonth, day);

        // ========================================
        // 土曜日
        // ========================================

        if (dayOfWeek === 6) {
            element.classList.add("saturday");
        }

        // ========================================
        // 日曜日
        // ========================================

        if (dayOfWeek === 0) {
            element.classList.add("sunday");
        }

        // ========================================
        // 今日
        // ========================================

        const today = new Date();

        if (
            today.getFullYear() === currentYear &&
            today.getMonth() === currentMonth - 1 &&
            today.getDate() === day
        ) {
            element.classList.add("today");
        }

        // ========================================
        // 日付番号
        // ========================================

        const dayNumber = document.createElement("div");

        dayNumber.className = "day-number";

        dayNumber.textContent = day;

        element.appendChild(dayNumber);

        // ========================================
        // 祝日
        // ========================================

        const holidayName = holidayCache[currentYear]?.[dateKey];

        if (holidayName) {
            element.classList.add("holiday");

            const holidayElement = document.createElement("span");

            holidayElement.className = "holiday-name";

            holidayElement.textContent = holidayName;

            dayNumber.appendChild(holidayElement);
        }

        // ========================================
        // この日の予定
        // ========================================

        const daySchedules = schedules.filter((schedule) => {
            const date = new Date(schedule.startDateTime);

            return (
                date.getFullYear() === currentYear &&
                date.getMonth() === currentMonth - 1 &&
                date.getDate() === day
            );
        });

        // ========================================
        // 予定表示
        // ========================================

        daySchedules.forEach((schedule) => {
            const event = document.createElement("div");

            event.className = "event-dot";

            const eventType = ["GAME", "MEETING"].includes(schedule.eventType)
                ? schedule.eventType
                : "PRACTICE";
            event.classList.add(
                eventType === "GAME"
                    ? "event-game"
                    : eventType === "MEETING"
                      ? "event-meeting"
                      : "event-practice",
            );

            const start = new Date(schedule.startDateTime);

            const end = new Date(schedule.endDateTime);

            event.textContent = `${formatTime(start)}～${formatTime(end)}`;
            event.title = [schedule.competitionName, schedule.round].filter(Boolean).join(" · ");

            // ========================================
            // 予定クリック
            // ========================================

            event.addEventListener("click", (clickEvent) => {
                // 日付セルのクリック処理を止める
                clickEvent.stopPropagation();

                focusCalendarEvent(schedule);
                showScheduleDetail(schedule);
            });
            event.addEventListener("keydown", (keyboardEvent) => {
                if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ") return;
                keyboardEvent.preventDefault();
                focusCalendarEvent(schedule);
                showScheduleDetail(schedule);
            });

            // マウスカーソル
            event.style.cursor = "pointer";
            event.tabIndex = 0;
            event.dataset.scheduleStart = schedule.startDateTime;
            event.setAttribute("role", "button");
            event.setAttribute("aria-label", `${formatTime(start)}から${formatTime(end)}の予定`);

            element.appendChild(event);
        });

        // ========================================
        // 日付クリック
        // ========================================

        if (daySchedules.length === 0 && isCalendarAdmin()) {
            element.classList.add("can-create-schedule");
            element.title = "クリックしてこの日に予定を登録";
        }

        element.addEventListener("dblclick", () => {
            if (daySchedules.length === 0 && isCalendarAdmin()) {
                window.location.href = `register.html?date=${encodeURIComponent(dateKey)}`;
                return;
            }
            showDaySchedule(currentYear, currentMonth, day);
        });

        calendarElement.appendChild(element);
    }
}

/** カレンダー内の対象予定を目立たせ、一覧から選んだ予定を見失わないようにします。 */
function focusCalendarEvent(schedule) {
    const startDate = new Date(schedule.startDateTime);
    if (startDate.getFullYear() !== currentYear || startDate.getMonth() + 1 !== currentMonth) {
        currentYear = startDate.getFullYear();
        currentMonth = startDate.getMonth() + 1;
        displayCalendar();
    }
    const target = [...document.querySelectorAll(".event-dot")].find(
        (element) => element.dataset.scheduleStart === schedule.startDateTime,
    );
    if (!target) return;
    document.querySelectorAll(".event-dot.is-focused").forEach((element) => {
        element.classList.remove("is-focused");
    });
    target.classList.add("is-focused");
    target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    window.setTimeout(() => target.classList.remove("is-focused"), 1800);
}

// ========================================
// クリックした日の予定へ移動
// ========================================

function showDaySchedule(year, month, day) {
    const daySchedules = schedules.filter((schedule) => {
        const date = new Date(schedule.startDateTime);

        return (
            date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
        );
    });

    if (daySchedules.length === 0) {
        return;
    }

    const target = document.querySelector("#scheduleList");

    target.scrollIntoView({
        behavior: "smooth",
    });
}

// ========================================
// 月変更
// ========================================

prevMonthButton.addEventListener("click", async () => {
    currentMonth--;

    if (currentMonth === 0) {
        currentMonth = 12;
        currentYear--;
    }

    displayCalendar();
    const yearToLoad = currentYear;
    loadHolidays(yearToLoad).then(() => {
        if (currentYear === yearToLoad) displayCalendar();
    });
});

nextMonthButton.addEventListener("click", async () => {
    currentMonth++;

    if (currentMonth === 13) {
        currentMonth = 1;
        currentYear++;
    }

    displayCalendar();
    const yearToLoad = currentYear;
    loadHolidays(yearToLoad).then(() => {
        if (currentYear === yearToLoad) displayCalendar();
    });
});

// ========================================
// 今後の予定表示
// ========================================

function displaySchedule() {
    if (schedules.length === 0) {
        scheduleElement.innerHTML = "<p>予定がありません。</p>";

        return;
    }

    // 今日の日付

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    // 今日以降の予定だけ取得

    const upcomingSchedules = schedules.filter((schedule) => {
        const start = new Date(schedule.startDateTime);

        return start >= today;
    });

    if (upcomingSchedules.length === 0) {
        scheduleElement.innerHTML = "<p>今後の予定はありません。</p>";

        return;
    }

    scheduleElement.innerHTML = "";

    upcomingSchedules.forEach((schedule) => {
        const start = new Date(schedule.startDateTime);

        const end = new Date(schedule.endDateTime);

        const eventElement = document.createElement("div");

        eventElement.className = "upcoming-schedule";
        eventElement.tabIndex = 0;
        eventElement.setAttribute("role", "button");
        eventElement.setAttribute("aria-label", `${formatDate(start)}の予定を表示`);

        const eventType = ["GAME", "MEETING"].includes(schedule.eventType)
            ? schedule.eventType
            : "PRACTICE";
        eventElement.classList.add(
            eventType === "GAME"
                ? "event-game"
                : eventType === "MEETING"
                  ? "event-meeting"
                  : "event-practice",
        );

        eventElement.innerHTML = `
            <div class="upcoming-kind">${eventType === "GAME" ? "試合" : eventType === "MEETING" ? "会議" : "練習"}</div>
            <div class="upcoming-date">
                ${formatDate(start)}
            </div>

            <div class="upcoming-time">
                ${formatTime(start)}
                ～
                ${formatTime(end)}
            </div>

            <div class="upcoming-time-zone">
                ${schedule.timeZone}
            </div>
            ${schedule.competitionName ? `<div class="upcoming-competition"><strong>${escapeHtml(schedule.competitionName)}</strong>${schedule.round ? ` · ${escapeHtml(schedule.round)}` : ""}</div>` : ""}
            <div class="upcoming-attendance">参加 ${schedule.attendanceTotal || 0}人 · 未定 ${schedule.attendanceMaybe || 0}人${Number(schedule.attendanceGuests || 0) ? ` · ゲスト ${schedule.attendanceGuests}人` : ""}</div>
        `;

        scheduleElement.appendChild(eventElement);
        const openDetail = () => {
            focusCalendarEvent(schedule);
            showScheduleDetail(schedule);
        };
        eventElement.addEventListener("click", openDetail);
        eventElement.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openDetail();
            }
        });
    });
}

/** 今日以降の予定を一覧表示し、予定ごとの出欠を選べるダイアログを開きます。 */
function openBulkAttendanceModal() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcomingSchedules = schedules.filter(
        (schedule) => new Date(schedule.startDateTime) >= today,
    );
    if (!upcomingSchedules.length) {
        if (bulkAttendanceStatus) bulkAttendanceStatus.textContent = "今後の予定はありません。";
        return;
    }
    bulkAttendanceSelections = new Map();
    bulkAttendanceRows.innerHTML = upcomingSchedules
        .map((schedule) => {
            const key = `${schedule.scheduleMonth}|${schedule.startDateTime}`;
            return `<div class="bulk-attendance-row" data-bulk-row="${escapeHtml(key)}">
                <div class="bulk-attendance-row-info"><strong>${formatDate(new Date(schedule.startDateTime))}</strong><span>${formatTime(new Date(schedule.startDateTime))}〜${formatTime(new Date(schedule.endDateTime))}</span></div>
                <div class="bulk-attendance-row-actions" role="group" aria-label="${formatDate(new Date(schedule.startDateTime))}の出欠">
                    <button type="button" class="button-light" data-bulk-row-status="ATTENDING">参加</button>
                    <button type="button" class="button-light" data-bulk-row-status="MAYBE">未定</button>
                    <button type="button" class="button-light" data-bulk-row-status="ABSENT">不参加</button>
                </div>
            </div>`;
        })
        .join("");
    if (bulkAttendanceDialogStatus) bulkAttendanceDialogStatus.textContent = "";
    bulkAttendanceModal.hidden = false;
    bulkAttendanceModal.classList.add("active");
}

function closeBulkAttendanceModal() {
    bulkAttendanceModal.classList.remove("active");
    bulkAttendanceModal.hidden = true;
}

/** ダイアログで選択した予定ごとの出欠をまとめて保存します。 */
async function saveBulkAttendance() {
    const rows = [...bulkAttendanceRows.querySelectorAll("[data-bulk-row]")];
    if (bulkAttendanceSelections.size !== rows.length) {
        bulkAttendanceDialogStatus.textContent = "すべての予定の出欠を選択してください。";
        return;
    }
    saveBulkAttendanceButton.disabled = true;
    if (bulkAttendanceDialogStatus) bulkAttendanceDialogStatus.textContent = "保存しています…";
    let successCount = 0;
    try {
        for (const row of rows) {
            const [scheduleMonth, startDateTime] = row.dataset.bulkRow.split("|");
            const status = bulkAttendanceSelections.get(row.dataset.bulkRow);
            const params = new URLSearchParams({
                feature: "schedule",
                resource: "attendance",
                scheduleMonth,
                startDateTime,
            });
            const response = await authenticatedFetch(`${API_URL}?${params}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, guestCount: 0 }),
            });
            if (!response.ok) throw new Error("一括回答の保存に失敗しました");
            successCount++;
        }
        if (bulkAttendanceStatus)
            bulkAttendanceStatus.textContent = `${successCount}件の出欠を更新しました。`;
        closeBulkAttendanceModal();
        await loadSchedule();
    } catch (error) {
        if (bulkAttendanceDialogStatus)
            bulkAttendanceDialogStatus.textContent = `${successCount}件を保存しました。${error.message}`;
    } finally {
        saveBulkAttendanceButton.disabled = false;
    }
}

openBulkAttendanceButton?.addEventListener("click", openBulkAttendanceModal);
closeBulkAttendanceButton?.addEventListener("click", closeBulkAttendanceModal);
cancelBulkAttendanceButton?.addEventListener("click", closeBulkAttendanceModal);
saveBulkAttendanceButton?.addEventListener("click", saveBulkAttendance);
bulkAttendanceRows?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-bulk-row-status]");
    const row = event.target.closest("[data-bulk-row]");
    if (!button || !row) return;
    bulkAttendanceSelections.set(row.dataset.bulkRow, button.dataset.bulkRowStatus);
    row.querySelectorAll("[data-bulk-row-status]").forEach((item) => {
        item.classList.toggle("is-selected", item === button);
    });
});

// ========================================
// 日付フォーマット
// ========================================

function formatDate(date) {
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];

    return `${date.getFullYear()}年
            ${date.getMonth() + 1}月
            ${date.getDate()}日
            (${weekdays[date.getDay()]})`;
}

// ========================================
// 時刻フォーマット
// ========================================

function formatTime(date) {
    const hours = String(date.getHours()).padStart(2, "0");

    const minutes = String(date.getMinutes()).padStart(2, "0");

    return `${hours}:${minutes}`;
}

// ========================================
// 画像アップロード
// ========================================
if (uploadButton) {
    uploadButton.addEventListener("click", async () => {
        const file = imageInput.files[0];

        if (!file) {
            alert("画像を選択してください。");

            return;
        }

        try {
            uploadButton.disabled = true;

            uploadStatus.textContent = "アップロード準備中...";

            // ========================================
            // ① Presigned URL取得
            // ========================================

            const response = await authenticatedFetch(UPLOAD_API_URL, {
                method: "POST",

                headers: {
                    "Content-Type": "application/json",
                },

                body: JSON.stringify({
                    fileName: file.name,

                    contentType: file.type,
                }),
            });

            if (!response.ok) {
                throw new Error("Upload APIエラー: " + response.status);
            }

            const data = await response.json();

            // ========================================
            // ② S3へ直接アップロード
            // ========================================

            uploadStatus.textContent = "画像をS3へアップロード中...";

            const uploadResponse = await fetch(data.uploadUrl, {
                method: "PUT",

                headers: {
                    "Content-Type": file.type,
                },

                body: file,
            });

            if (!uploadResponse.ok) {
                throw new Error("S3アップロードエラー: " + uploadResponse.status);
            }

            // ========================================
            // ③ 完了
            // ========================================

            uploadStatus.textContent = "アップロード完了！解析中です。";

            alert("画像をアップロードしました。\n" + "Geminiによる予定解析を開始します。");

            imageInput.value = "";
        } catch (error) {
            console.error("画像アップロードエラー:", error);

            uploadStatus.textContent = "アップロードに失敗しました。";

            alert("アップロードに失敗しました。\n" + error.message);
        } finally {
            uploadButton.disabled = false;
        }
    });
}

// ========================================
// Cognito認証
// ========================================

const cognitoDomain = "https://ap-northeast-1cd5fxlwj3.auth.ap-northeast-1.amazoncognito.com";

const clientId = "3mr9ep2rosop9ratlg1l3bta70";

const redirectUri = "https://d13o4oynf3jxlu.cloudfront.net";

function getValidIdTokenClaims() {
    const token = localStorage.getItem("id_token");
    if (!token) {
        return null;
    }

    try {
        const encodedPayload = token.split(".")[1];
        if (!encodedPayload) {
            throw new Error("IDトークンの形式が不正です");
        }

        const base64 = encodedPayload.replace(/-/g, "+").replace(/_/g, "/");
        const payload = JSON.parse(atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4)));

        if (!payload.exp || payload.exp * 1000 <= Date.now()) {
            throw new Error("IDトークンの有効期限が切れています");
        }
        return payload;
    } catch (error) {
        localStorage.removeItem("id_token");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        return null;
    }
}

function escapeIcsText(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

function foldIcsLine(line) {
    const folded = [];
    let current = "";
    let byteLength = 0;

    for (const character of line) {
        const characterBytes = new TextEncoder().encode(character).length;
        if (byteLength + characterBytes > 75) {
            folded.push(current);
            current = " " + character;
            byteLength = 1 + characterBytes;
        } else {
            current += character;
            byteLength += characterBytes;
        }
    }

    folded.push(current);
    return folded.join("\r\n");
}

function toIcsUtcDateTime(value) {
    return new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

async function exportCurrentMonthToIcs() {
    const monthKey = `${currentYear}-${String(currentMonth).padStart(2, "0")}`;
    const monthSchedules = schedules
        .filter((schedule) => schedule.scheduleMonth === monthKey)
        .sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

    if (monthSchedules.length === 0) {
        throw new Error(`${currentMonth}月の予定はありません。`);
    }

    if (facilities.length === 0) {
        await loadFacilities();
    }

    if (facilities.length === 0 && monthSchedules.some((schedule) => schedule.facilityId)) {
        throw new Error("施設情報を取得できませんでした。時間をおいて再度お試しください。");
    }

    const lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//FLIGHT PENGUINS//Official Site//JA",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ];

    monthSchedules.forEach((schedule) => {
        const start = new Date(schedule.startDateTime);
        const end = new Date(schedule.endDateTime);
        const facility = facilities.find((item) => item.facilityId === schedule.facilityId);
        const title = [
            schedule.eventType === "GAME"
                ? "試合"
                : schedule.eventType === "MEETING"
                  ? "会議"
                  : "練習",
            schedule.eventType === "GAME" ? schedule.competitionName : "",
            schedule.eventType === "GAME" ? schedule.round : "",
        ]
            .filter(Boolean)
            .join(" · ");
        const location = [facility?.facilityName, facility?.address].filter(Boolean).join(" ");
        const uidDate = `${schedule.scheduleMonth}-${schedule.startDateTime}`.replace(
            /[^0-9]/g,
            "",
        );

        lines.push(
            "BEGIN:VEVENT",
            `UID:${uidDate}@flightpenguins`,
            `DTSTAMP:${toIcsUtcDateTime(new Date())}`,
            `DTSTART:${toIcsUtcDateTime(start)}`,
            `DTEND:${toIcsUtcDateTime(end)}`,
            `SUMMARY:${escapeIcsText(title)}`,
        );

        if (location) {
            lines.push(`LOCATION:${escapeIcsText(location)}`);
        }
        if (facility?.note) {
            lines.push(`DESCRIPTION:${escapeIcsText(facility.note)}`);
        }
        if (facility?.url) {
            lines.push(`URL:${String(facility.url).replace(/[\r\n]/g, "")}`);
        }

        if (schedule.videoUrl)
            lines.push("ATTACH;VALUE=URI:" + String(schedule.videoUrl).replace(/[\r\n]/g, ""));
        lines.push("END:VEVENT");
    });

    lines.push("END:VCALENDAR");
    const content = lines.map(foldIcsLine).join("\r\n") + "\r\n";
    const file = new Blob([content], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `flight-penguins-${monthKey}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return monthSchedules.length;
}

if (exportMonthCalendarButton) {
    exportMonthCalendarButton.disabled = true;
    exportMonthCalendarButton.addEventListener("click", async () => {
        exportMonthCalendarButton.disabled = true;
        calendarExportStatus.textContent = "カレンダーファイルを作成しています...";
        try {
            const count = await exportCurrentMonthToIcs();
            calendarExportStatus.textContent = `${currentMonth}月の予定${count}件を保存しました。Googleカレンダーへ取り込んでください。`;
        } catch (error) {
            calendarExportStatus.textContent = error.message;
        } finally {
            exportMonthCalendarButton.disabled = false;
        }
    });
}

const monthEmojis = ["🎍", "❄️", "🌸", "🌸", "🌿", "☔", "🌻", "🌻", "🍁", "🌕", "🍂", "🎄"];
async function copyCurrentMonthScheduleText() {
    const monthKey = String(currentYear) + "-" + String(currentMonth).padStart(2, "0");
    const rows = schedules
        .filter((item) => item.scheduleMonth === monthKey)
        .sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
    if (!rows.length) throw new Error(currentMonth + "月の予定はありません。");
    const weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    const lines = [
        monthEmojis[currentMonth - 1] + currentMonth + "月予定" + monthEmojis[currentMonth - 1],
        "",
    ];
    for (const item of rows) {
        const start = new Date(item.startDateTime),
            end = new Date(item.endDateTime);
        const label =
            item.eventType === "GAME" ? "【試合】" : item.eventType === "MEETING" ? "【会議】" : "";
        const date =
            String(start.getMonth() + 1).padStart(2, "0") +
            "/" +
            String(start.getDate()).padStart(2, "0") +
            "(" +
            weekdays[start.getDay()] +
            ")";
        lines.push(date + " " + label + formatTime(start) + "〜" + formatTime(end));
    }
    const text = lines.join("\n");
    try {
        await navigator.clipboard.writeText(text);
    } catch {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand("copy");
        textarea.remove();
        if (!copied)
            throw new Error("コピーできませんでした。ブラウザのコピー権限を確認してください。");
    }
    calendarExportStatus.textContent =
        currentMonth + "月の予定" + rows.length + "件をLINE用にコピーしました。";
}

copyMonthScheduleTextButton?.addEventListener("click", async () => {
    copyMonthScheduleTextButton.disabled = true;
    try {
        await copyCurrentMonthScheduleText();
    } catch (error) {
        calendarExportStatus.textContent = error.message;
    } finally {
        copyMonthScheduleTextButton.disabled = false;
    }
});

async function authenticatedFetch(url, options = {}) {
    const token = localStorage.getItem("id_token");
    if (!getValidIdTokenClaims() || !token) {
        updateAuthUI();
        throw new Error("ログインしてください。");
    }

    return fetch(url, {
        ...options,
        headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${token}`,
        },
    });
}

/**
 * Googleで取得したCognito IDトークンを、元のログインユーザーへ連携します。
 *
 * @param {string} nativeToken 連携開始前の既存ユーザーのIDトークン
 * @param {string} googleIdToken Google認証後に発行されたIDトークン
 */
async function completeGoogleAccountLink(nativeToken, googleIdToken) {
    const response = await fetch(`${API_URL}?feature=basketball&resource=account-link`, {
        method: "PUT",
        headers: {
            Authorization: `Bearer ${nativeToken}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ googleIdToken }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
        throw new Error(result.message || "Googleアカウントを連携できませんでした。");
    }
}

// ========================================
// Cognito認証コード → トークン
// ========================================

async function handleCognitoCallback() {
    const params = new URLSearchParams(window.location.search);

    const code = params.get("code");
    const oauthError = params.get("error");

    if (!code && oauthError) {
        const linkState = sessionStorage.getItem("google_link_state");
        if (linkState && params.get("state") === linkState) {
            sessionStorage.removeItem("google_link_state");
            sessionStorage.removeItem("google_link_native_token");
            window.history.replaceState({}, document.title, window.location.pathname);
            alert(
                params.get("error_description") ||
                    "Googleアカウント連携に失敗しました。Cognitoの設定を確認してください。",
            );
        }
        return;
    }

    // ログイン後でなければ何もしない
    if (!code) {
        return;
    }

    console.log("Cognito認証コードを取得しました");

    const linkState = sessionStorage.getItem("google_link_state");
    const isGoogleLinkFlow = Boolean(linkState && params.get("state") === linkState);
    const nativeToken = sessionStorage.getItem("google_link_native_token");

    try {
        const response = await fetch(`${cognitoDomain}/oauth2/token`, {
            method: "POST",

            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },

            body: new URLSearchParams({
                grant_type: "authorization_code",

                client_id: clientId,

                code: code,

                redirect_uri: redirectUri,
            }),
        });

        const tokens = await response.json();

        if (!response.ok) {
            throw new Error(
                tokens.error_description || tokens.error || "トークン取得に失敗しました",
            );
        }

        if (isGoogleLinkFlow) {
            if (!nativeToken) throw new Error("連携元のログイン情報が見つかりません。");
            await completeGoogleAccountLink(nativeToken, tokens.id_token);
            sessionStorage.removeItem("google_link_state");
            sessionStorage.removeItem("google_link_native_token");
            sessionStorage.setItem("google_linked", "1");
            window.history.replaceState({}, document.title, window.location.pathname);
            alert("Googleアカウントを連携しました。次回からGoogleでもログインできます。");
            return;
        }

        // 通常ログインでは取得したトークンを保存します。
        localStorage.setItem("id_token", tokens.id_token);
        localStorage.setItem("access_token", tokens.access_token);

        if (tokens.refresh_token) {
            localStorage.setItem("refresh_token", tokens.refresh_token);
        }

        console.log("Cognitoログイン成功");

        updateAuthUI();

        console.log("=== updateAuthUI完了 ===");

        // URLから ?code=xxxxx を削除
        window.history.replaceState({}, document.title, window.location.pathname);
    } catch (error) {
        if (isGoogleLinkFlow) {
            sessionStorage.removeItem("google_link_state");
            sessionStorage.removeItem("google_link_native_token");
        }
        console.error("Cognito認証エラー:", error);
        if (isGoogleLinkFlow) alert(error.message || "Googleアカウントを連携できませんでした。");
    }
}

// ========================================
// ログインボタン
// ========================================

const loginButton = document.getElementById("loginButton");

if (loginButton) {
    loginButton.addEventListener("click", () => {
        window.location.href = "signin.html";
    });
}

// ========================================
// ログイン状態・管理者権限を確認
// ========================================

function updateAuthUI() {
    const claims = getValidIdTokenClaims();
    const idToken = claims ? localStorage.getItem("id_token") : null;

    const calendarContent = document.getElementById("calendarContent");

    const loginRequiredMessage = document.getElementById("loginRequiredMessage");

    const loginButton = document.getElementById("loginButton");

    const logoutButton = document.getElementById("logoutButton");

    const registerButton = document.getElementById("registerButton");

    // =========================
    // 未ログイン
    // =========================

    if (!idToken) {
        if (calendarContent) {
            calendarContent.hidden = true;
        }
        if (mainNavigation) mainNavigation.hidden = true;

        if (loginRequiredMessage) {
            loginRequiredMessage.hidden = false;
        }

        if (loginButton) {
            loginButton.style.display = "inline-block";
        }

        if (logoutButton) {
            logoutButton.style.display = "none";
        }

        if (registerButton) {
            registerButton.style.display = "inline-block";
        }

        document.dispatchEvent(new Event("app:auth-changed"));

        return;
    }

    if (calendarContent) {
        calendarContent.hidden = false;
    }
    if (mainNavigation) mainNavigation.hidden = false;
    const admin = isCalendarAdmin();
    document
        .querySelectorAll(
            '.site-navigation [data-app-nav="schedule"], .site-navigation [data-app-nav="facility"], .site-navigation [data-app-nav="announcements"]',
        )
        .forEach((link) => {
            link.hidden = !admin;
        });

    if (loginRequiredMessage) {
        loginRequiredMessage.hidden = true;
    }

    // =========================
    // ログイン済み
    // =========================

    if (loginButton) {
        loginButton.style.display = "none";
    }

    if (logoutButton) {
        logoutButton.style.display = "inline-block";
    }

    if (registerButton) {
        registerButton.style.display = "none";
    }

    // =========================
    // 管理者判定
    // =========================

    try {
        const groups = claims["cognito:groups"] || [];
        const isAdmin =
            Array.isArray(groups) && (groups.includes("admins") || groups.includes("root-admins"));

        // =========================
        // 管理者の場合
        // =========================
    } catch (error) {
        console.error("IDトークン解析エラー:", error);
    }

    document.dispatchEvent(new Event("app:auth-changed"));
}

// ========================================
// ログアウトボタン
// ========================================

const logoutButton = document.getElementById("logoutButton");

if (logoutButton) {
    logoutButton.addEventListener("click", () => {
        // ローカルのトークンを削除
        localStorage.removeItem("id_token");
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");

        // Cognitoからログアウト
        const logoutUrl =
            `${cognitoDomain}/logout` +
            `?client_id=${clientId}` +
            `&logout_uri=${encodeURIComponent(redirectUri)}`;

        window.location.href = logoutUrl;
    });
}

// ========================================
// 新規登録ボタン
// ========================================

const registerButton = document.getElementById("registerButton");

if (registerButton) {
    registerButton.addEventListener("click", () => {
        window.location.href = "join.html";
    });
}

// ========================================
// 初期表示
// ========================================

handleCognitoCallback().then(async () => {
    console.log("=== 初期表示処理開始 ===");

    updateAuthUI();

    if (!getValidIdTokenClaims()) {
        return;
    }

    displayCalendar();
    const yearToLoad = currentYear;
    loadHolidays(yearToLoad).then(() => {
        if (currentYear === yearToLoad) displayCalendar();
    });

    await Promise.all([loadSchedule(), loadFacilities()]);

    console.log("=== 初期表示処理完了 ===");
});

// ========================================
// 予定詳細ダイアログ
// ========================================

const scheduleDetailModal = document.getElementById("scheduleDetailModal");

const closeScheduleDetailButton = document.getElementById("closeScheduleDetailButton");

const closeScheduleDetailButtonBottom = document.getElementById("closeScheduleDetailButtonBottom");

const editScheduleButton = document.getElementById("editScheduleButton");

const deleteScheduleButton = document.getElementById("deleteScheduleButton");

const startBasketballButton = document.getElementById("startBasketballButton");
const scheduleViewMode = document.getElementById("scheduleViewMode");
const scheduleEditMode = document.getElementById("scheduleEditMode");
const viewModeButtons = document.getElementById("viewModeButtons");
const editModeButtons = document.getElementById("editModeButtons");
const saveScheduleButton = document.getElementById("saveScheduleButton");
const cancelEditScheduleButton = document.getElementById("cancelEditScheduleButton");
const editEventType = document.getElementById("editEventType");
const editCompetitionName = document.getElementById("editCompetitionName");
const editCompetitionRow = document.getElementById("editCompetitionRow");
const editRound = document.getElementById("editRound");
const editRoundRow = document.getElementById("editRoundRow");
const editVideoUrl = document.getElementById("editVideoUrl");
const editVideoTags = document.getElementById("editVideoTags");
const editDate = document.getElementById("editDate");
const editStartTime = document.getElementById("editStartTime");
const editEndTime = document.getElementById("editEndTime");
const editFacilityId = document.getElementById("editFacilityId");
const editDayOfWeek = document.getElementById("editDayOfWeek");
const editAddress = document.getElementById("editAddress");
const editFacilityUrl = document.getElementById("editFacilityUrl");
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
    exitEditMode();
    scheduleDetailModal.classList.remove("active");
}

/** 予定の参加状況と現在のユーザーの回答を表示します。 */
async function loadAttendance(schedule) {
    const summary = document.getElementById("attendanceSummary");
    const statusMessage = document.getElementById("attendanceStatus");
    const participants = document.getElementById("attendanceParticipants");
    if (!summary) return;
    summary.textContent = "参加状況を読み込んでいます…";
    try {
        const params = new URLSearchParams({
            resource: "attendance",
            scheduleMonth: schedule.scheduleMonth,
            startDateTime: schedule.startDateTime,
        });
        const response = await authenticatedFetch(`${API_URL}?${params}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "参加状況を取得できませんでした");
        summary.textContent = `参加 ${data.total || 0}人 · 未定 ${data.maybe || 0}人 · 不参加 ${data.absent || 0}人 · ゲスト ${data.guests || 0}人`;
        const guestInput = document.getElementById("attendanceGuestCount");
        if (guestInput) guestInput.value = String(data.currentGuestCount || 0);
        document.querySelectorAll("[data-attendance-status]").forEach((button) => {
            button.classList.toggle(
                "is-selected",
                button.dataset.attendanceStatus === data.currentStatus,
            );
        });
        if (participants && Array.isArray(data.participants)) {
            participants.hidden = false;
            participants.innerHTML = data.participants.length
                ? data.participants
                      .map(
                          (item) =>
                              `<span>${escapeHtml(item.username || "メンバー")} · ${attendanceLabel(item.status)}</span>`,
                      )
                      .join("")
                : "参加回答はまだありません。";
        }
    } catch (error) {
        summary.textContent = "参加状況を取得できませんでした";
        if (statusMessage) statusMessage.textContent = error.message;
    }
}

function attendanceLabel(status) {
    return status === "ATTENDING" ? "参加" : status === "MAYBE" ? "未定" : "不参加";
}

async function saveAttendanceStatus(status) {
    if (!currentScheduleDetail) return;
    const statusMessage = document.getElementById("attendanceStatus");
    const buttons = document.querySelectorAll("[data-attendance-status]");
    buttons.forEach((button) => (button.disabled = true));
    if (statusMessage) statusMessage.textContent = "参加状況を保存しています…";
    try {
        const params = new URLSearchParams({
            feature: "schedule",
            resource: "attendance",
            scheduleMonth: currentScheduleDetail.scheduleMonth,
            startDateTime: currentScheduleDetail.startDateTime,
        });
        const response = await authenticatedFetch(`${API_URL}?${params}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                status,
                guestCount: Number(document.getElementById("attendanceGuestCount")?.value || 0),
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || "参加状況を保存できませんでした");
        if (statusMessage) statusMessage.textContent = "参加状況を保存しました";
        await loadAttendance(currentScheduleDetail);
    } catch (error) {
        if (statusMessage) statusMessage.textContent = error.message;
    } finally {
        buttons.forEach((button) => (button.disabled = false));
    }
}

document.querySelectorAll("[data-attendance-status]").forEach((button) => {
    button.addEventListener("click", () => saveAttendanceStatus(button.dataset.attendanceStatus));
});

// ========================================
// 詳細APIから予定取得
// ========================================
async function showScheduleDetail(schedule) {
    try {
        exitEditMode();
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
        if (competitionRow)
            competitionRow.hidden = detail.eventType !== "GAME" || !detail.competitionName;
        if (roundRow) roundRow.hidden = detail.eventType !== "GAME" || !detail.round;
        const eventVideoRow = document.getElementById("detailEventVideoRow");
        const eventVideo = document.getElementById("detailEventVideo");
        if (eventVideoRow) eventVideoRow.hidden = !detail.videoUrl;
        if (eventVideo) {
            if (detail.videoUrl) eventVideo.href = detail.videoUrl;
            else eventVideo.removeAttribute("href");
        }
        const videoTags = String(detail.videoTags || "")
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean);
        const detailVideoTags = document.getElementById("detailVideoTags");
        const detailVideoTagsRow = document.getElementById("detailVideoTagsRow");
        if (detailVideoTags) detailVideoTags.textContent = videoTags.join(" · ");
        if (detailVideoTagsRow) detailVideoTagsRow.hidden = videoTags.length === 0;

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

        const idToken = localStorage.getItem("id_token");

        let isAdmin = false;

        if (idToken) {
            try {
                const payload = JSON.parse(
                    atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
                );

                console.log("詳細画面のCognitoユーザー:", payload);

                const groups = payload["cognito:groups"] || [];

                console.log("詳細画面のCognitoグループ:", groups);

                isAdmin =
                    Array.isArray(groups) &&
                    (groups.includes("admins") || groups.includes("root-admins"));

                console.log("詳細画面 isAdmin:", isAdmin);
            } catch (error) {
                console.error("管理者判定エラー:", error);
            }
        }

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
        loadAttendance(detail);
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

if (cancelEditScheduleButton) {
    cancelEditScheduleButton.addEventListener("click", () => {
        exitEditMode();
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
    document.getElementById("editCompetitionName").value =
        currentScheduleDetail.competitionName || "";
    document.getElementById("editRound").value = currentScheduleDetail.round || "";
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
