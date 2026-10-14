import { describe, expect, it } from "vitest";
import { unwrapItems } from "./api";

describe("unwrapItems", () => {
    it("Lambdaのitemsラッパーから一覧を取り出す", () => {
        expect(unwrapItems({ items: [{ teamId: "MAIN" }] })).toEqual([{ teamId: "MAIN" }]);
    });

    it("配列レスポンスとの後方互換性を保つ", () => {
        expect(unwrapItems([{ teamId: "MAIN" }])).toEqual([{ teamId: "MAIN" }]);
    });

    it("itemsが欠けたレスポンスは安全に空配列として扱う", () => {
        expect(unwrapItems({})).toEqual([]);
    });
});
