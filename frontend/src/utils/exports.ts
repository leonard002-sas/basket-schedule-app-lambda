import type { Schedule } from "../types/domain";
function download(content: string, fileName: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
}
function icsDate(value: string) {
    return value.replace(/[-:]/g, "").replace("T", "T") + "00";
}
export function downloadCalendar(items: Schedule[], month: string) {
    const body = items
        .map((item) =>
            [
                "BEGIN:VEVENT",
                `UID:${encodeURIComponent(item.startDateTime)}@flight-penguins`,
                `DTSTART:${icsDate(item.startDateTime)}`,
                `DTEND:${icsDate(item.endDateTime)}`,
                `SUMMARY:${item.eventType === "GAME" ? item.competitionName || "試合" : item.eventType === "MEETING" ? "会議" : "練習"}`,
                `LOCATION:${item.facilityName || ""}`,
                item.videoUrl ? `URL:${item.videoUrl}` : "",
                "END:VEVENT",
            ]
                .filter(Boolean)
                .join("\r\n"),
        )
        .join("\r\n");
    download(
        `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Team App//JA\r\n${body}\r\nEND:VCALENDAR`,
        `${month}-schedule.ics`,
        "text/calendar;charset=utf-8",
    );
}
export function lineTemplate(items: Schedule[], month: number) {
    const moons = ["🎍", "❄️", "🌸", "🌸", "🎏", "☔", "🌊", "🌻", "🌕", "🎃", "🍁", "🎄"];
    return `${moons[month - 1]}${month}月予定${moons[month - 1]}\n\n${items
        .map((item) => {
            const date = new Date(item.startDateTime);
            return `${date.getMonth() + 1}/${String(date.getDate()).padStart(2, "0")}(${"日月火水木金土"[date.getDay()]}) ${item.startDateTime.slice(11, 16)}〜${item.endDateTime.slice(11, 16)}${item.facilityName ? `\n${item.facilityName}` : ""}`;
        })
        .join("\n\n")}`;
}
export function downloadCsv(rows: Record<string, unknown>[], fileName: string) {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    download(
        `\uFEFF${[keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\r\n")}`,
        fileName,
        "text/csv;charset=utf-8",
    );
}
