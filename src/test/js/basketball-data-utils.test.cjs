const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

// DOM や AWS に接続せず、画面間で共有するデータ変換だけを検証する。
const sourcePath = path.join(__dirname, "../../main/resources/static/basketball-data-utils.js");
const context = {};
vm.runInNewContext(`${fs.readFileSync(sourcePath, "utf8")}\nthis.scorebookUtils = {
    parseCsv, parsePlayerRows, parseMigrationCsv, normalizeImportDate, ratio, eff, csvCell
};`, context);
const utils = context.scorebookUtils;

test("quoted commas and escaped quotes stay inside their CSV cell", () => {
    assert.deepEqual(
        JSON.parse(JSON.stringify(utils.parseCsv('PLAYER,NOTE\r\n"A, B","said ""yes"""'))),
        [["PLAYER", "NOTE"], ["A, B", 'said "yes"']],
    );
});

test("spreadsheet date formats normalize to ISO dates", () => {
    assert.equal(utils.normalizeImportDate("2026/9/4"), "2026-09-04");
    assert.equal(utils.normalizeImportDate("9/4/2026"), "2026-09-04");
    assert.equal(utils.normalizeImportDate("not-a-date"), "");
});

test("CSV migration groups player rows into games and maps score fields", () => {
    const parsed = utils.parseMigrationCsv(
        "DATE,COMPETITION,ROUND,OPPONENT,OPPONENT_SCORE,PLAYER,PTS,REB\n" +
        "2026-09-04,Autumn Cup,1回戦,Blue,48,Aki,12,5\n" +
        "2026-09-04,Autumn Cup,1回戦,Blue,48,Ken,8,7",
    );

    assert.equal(parsed.multi, true);
    assert.equal(parsed.matches.length, 1);
    assert.equal(parsed.matches[0].opponentScore, 48);
    assert.deepEqual(
        JSON.parse(JSON.stringify(parsed.matches[0].players.map(({ name, stats }) => ({ name, stats })))),
        [{ name: "Aki", stats: { PTS: 12, REB: 5 } }, { name: "Ken", stats: { PTS: 8, REB: 7 } }],
    );
});

test("box-score ratios, efficiency, and CSV escaping handle empty and quoted values", () => {
    assert.equal(utils.ratio(0, 0), "—");
    assert.equal(utils.ratio(5, 10), "50.0%");
    assert.equal(utils.eff({ points: 10, REB: 3, AST: 2, STL: 1, BLK: 0, FGA: 4, FGM: 2, FTA: 2, FTM: 1, TO: 1 }), 12);
    assert.equal(utils.csvCell('A, "B"'), '"A, ""B"""');
});
