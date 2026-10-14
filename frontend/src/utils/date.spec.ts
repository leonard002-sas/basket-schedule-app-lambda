import { describe, expect, it } from "vitest";
import { formatScheduleDateTimeRange } from "./date";

describe("formatScheduleDateTimeRange", () => {
    it("秒を表示せず、曜日を含むチーム現地時刻へ整形する", () => {
        expect(formatScheduleDateTimeRange("2026-10-08T18:30:00", "2026-10-08T21:00:00")).toBe(
            "2026年10月8日（木） 18:30〜21:00",
        );
    });

    it("不正な日付は入力値を失わずに表示する", () => {
        expect(formatScheduleDateTimeRange("unknown", "end")).toBe("unknown〜end");
    });
});
