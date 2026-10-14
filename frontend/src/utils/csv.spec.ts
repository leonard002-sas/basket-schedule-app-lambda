import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv";

describe("parseCsv", () => {
    it("引用符内のカンマと改行を同じセルとして扱う", () => {
        expect(parseCsv('PLAYER,NOTE\r\n"立石, A","前半\n後半"')).toEqual([
            ["PLAYER", "NOTE"],
            ["立石, A", "前半\n後半"],
        ]);
    });

    it("二重化された引用符を一つの引用符へ戻す", () => {
        expect(parseCsv('PLAYER,NOTE\nA,"say ""go"""')).toEqual([
            ["PLAYER", "NOTE"],
            ["A", 'say "go"'],
        ]);
    });
});
