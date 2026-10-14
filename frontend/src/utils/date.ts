const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

/** タイムゾーン変換を挟まず、保存されているチーム現地時刻を日本語で表示します。 */
export function formatScheduleDateTimeRange(start: string, end: string): string {
    const [date, startTime = ""] = start.split("T");
    const [, endTime = ""] = end.split("T");
    const [year, month, day] = date.split("-").map(Number);
    if (!year || !month || !day) return `${start}〜${end}`;
    const weekday = WEEKDAYS[new Date(year, month - 1, day).getDay()];
    return `${year}年${month}月${day}日（${weekday}） ${startTime.slice(0, 5)}〜${endTime.slice(0, 5)}`;
}
