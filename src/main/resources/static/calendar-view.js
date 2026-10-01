/** 月間カレンダーと予定一覧の描画を担当します。 */

/** 共通ナビゲーションで現在表示しているカレンダー項目を強調します。 */
function setCalendarNavigationItem(key) {
    document.querySelectorAll(".site-navigation [data-app-nav]").forEach((link) => {
        if (link.dataset.appNav === key) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
    });
}

/** カレンダー内をスクロールしてもナビゲーションを操作できる状態に保ちます。 */
function initializeCalendarNavigation() {
    const nav = document.querySelector(".site-navigation");
    if (!nav) return;

    const sectionById = new Map([
        ["calendarArea", "calendar"],
        ["announcementsArea", "announcements"],
        ["videoArchive", "videos"],
    ]);
    const initialSection =
        location.hash === "#announcementsArea"
            ? "announcements"
            : location.hash === "#videoArchive"
              ? "videos"
              : "calendar";
    setCalendarNavigationItem(initialSection);

    nav.addEventListener("click", (event) => {
        const link = event.target.closest('a[href^="index.html#"]');
        if (!link) return;
        const targetId = new URL(link.href, location.href).hash.slice(1);
        const sectionKey = [...sectionById.entries()].find(([id]) => id === targetId)?.[1];
        if (sectionKey) setCalendarNavigationItem(sectionKey);
    });

    if ("IntersectionObserver" in window) {
        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
                const key = visible && sectionById.get(visible.target.id);
                if (key) setCalendarNavigationItem(key);
            },
            { rootMargin: "-20% 0px -55% 0px", threshold: [0, 0.25, 0.5] },
        );
        sectionById.forEach((key, id) => {
            const target = document.getElementById(id);
            if (target) observer.observe(target);
        });
    }
}

initializeCalendarNavigation();

/** ログイン済みの予定データから、選択月のカレンダーを作り直します。 */
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

                showScheduleDetail(schedule);
            });

            // マウスカーソル
            event.style.cursor = "pointer";

            element.appendChild(event);
        });

        // ========================================
        // 日付クリック
        // ========================================

        element.addEventListener("click", () => {
            showDaySchedule(currentYear, currentMonth, day);
        });

        calendarElement.appendChild(element);
    }
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
                ${escapeHtml(schedule.timeZone || "")}
            </div>
            ${schedule.competitionName ? `<div class="upcoming-competition"><strong>${escapeHtml(schedule.competitionName)}</strong>${schedule.round ? ` · ${escapeHtml(schedule.round)}` : ""}</div>` : ""}
        `;

        scheduleElement.appendChild(eventElement);
    });
}

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
            // ① 署名付きURLを取得します。
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

function getDateKey(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ========================================
// 予定取得
// ========================================

function scheduleKind(schedule) {
    return schedule.eventType === "GAME"
        ? { label: "試合", icon: "🏀", className: "game" }
        : schedule.eventType === "MEETING"
          ? { label: "会議", icon: "📋", className: "meeting" }
          : { label: "練習", icon: "🏀", className: "practice" };
}

/** 予定1件を「今日・今週」欄の安全なHTMLへ整形します。 */
function agendaCard(schedule) {
    const start = new Date(schedule.startDateTime),
        end = new Date(schedule.endDateTime),
        kind = scheduleKind(schedule);
    const facility =
        facilities.find((item) => item.facilityId === schedule.facilityId)?.facilityName ||
        schedule.facilityName ||
        "施設未設定";
    return `<article class="agenda-event agenda-${kind.className}"><span class="agenda-type">${kind.icon} ${kind.label}</span><strong>${formatDate(start)}</strong><span>${formatTime(start)}〜${formatTime(end)}</span><span class="agenda-facility">${escapeHtml(facility)}</span>${schedule.competitionName ? `<small>${escapeHtml(schedule.competitionName)}${schedule.round ? ` · ${escapeHtml(schedule.round)}` : ""}</small>` : ""}</article>`;
}

/** 今日と今週の予定を抽出し、ホーム画面の概要欄へ表示します。 */
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
        : "<p class='agenda-empty'>今日は予定がありません。</p>";
    weekBox.innerHTML = weekItems.length
        ? weekItems.map(agendaCard).join("")
        : "<p class='agenda-empty'>今週の予定はありません。</p>";
}

/** 動画URLの登録された予定を、タグで絞り込める一覧に表示します。 */
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

/** 利用者が登録した文字列をHTMLとして解釈されない形へ変換します。 */
function escapeHtml(value) {
    return String(value ?? "").replace(
        /[&<>"']/g,
        (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char],
    );
}
