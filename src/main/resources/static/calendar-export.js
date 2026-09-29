/** ICSファイル出力と月間予定の共有文作成を担当します。 */
const exportMonthCalendarButton = document.getElementById("exportMonthCalendar");
const copyMonthScheduleTextButton = document.getElementById("copyMonthScheduleText");

/** ICS 内で区切り文字や改行が誤解されないように文字を保護します。 */
function escapeIcsText(value) {
    return String(value || "")
        .replace(/\\/g, "\\\\")
        .replace(/\r\n|\r|\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
}

/** カレンダーアプリの行長制限に合わせて長いICS行を折り返します。 */
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

/** ISO形式の日時をICSで使うUTC表記へ変換します。 */
function toIcsUtcDateTime(value) {
    return new Date(value)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z");
}

/** 表示中の月の予定をICSファイルにして利用者の端末へ保存します。 */
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
/** 表示中の月の予定を共有しやすい文章にしてクリップボードへコピーします。 */
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
