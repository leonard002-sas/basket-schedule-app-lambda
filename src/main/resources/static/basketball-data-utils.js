"use strict";

/** スコアブック画面で共有するCSV変換とボックススコア計算の純粋関数です。 */
/**
 * 引用符内のカンマや二重引用符を保ったままCSVを解析します。
 * @param {string} text 選択されたCSVファイルの内容
 * @returns {string[][]} セル値を並べた行の配列
 */
/** 引用符や改行を含むCSVを、セル値の二次元配列へ読み取ります。 */
function parseCsv(text) {
    const rows = [];
    let row = [];
    let cell = "";
    let insideQuotes = false;

    for (let index = 0; index < text.length; index++) {
        const character = text[index];
        if (insideQuotes) {
            if (character === '"' && text[index + 1] === '"') {
                cell += '"';
                index++;
            } else if (character === '"') {
                insideQuotes = false;
            } else {
                cell += character;
            }
            continue;
        }

        if (character === '"') {
            insideQuotes = true;
        } else if (character === ",") {
            row.push(cell);
            cell = "";
        } else if (character === "\n") {
            row.push(cell.replace(/\r$/, ""));
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    if (cell.length || row.length) {
        row.push(cell.replace(/\r$/, ""));
        rows.push(row);
    }
    return rows;
}

/**
 * PLAYER列を持つ表データを検証し、選手スタッツの形式に変換します。
 * @param {string[][]} rows 見出し行を含むCSVの行データ
 * @returns {Array<object>} 移行APIへ渡せる選手データ
 */
/** 選手ごとに分かれた表の行を読み、試合単位のデータへまとめます。 */
function parsePlayerRows(rows) {
    if (rows.length < 2) throw new Error("CSVにデータ行がありません。");
    const headers = rows[0].map((h) =>
        h
            .replace(/^\uFEFF/, "")
            .trim()
            .toUpperCase()
            .replace(/\s+/g, ""),
    );
    const findIndex = (...names) => headers.findIndex((h) => names.includes(h));
    const nameIndex = findIndex("PLAYER", "NAME", "選手", "選手名");
    if (nameIndex < 0) throw new Error("PLAYER（選手名）列が見つかりません。");
    const aliases = {
        PTS: ["PTS", "POINTS"],
        REB: ["REB", "REBOUNDS"],
        AST: ["AST", "ASSISTS"],
        STL: ["STL", "STEALS"],
        BLK: ["BLK", "BLOCKS"],
        FGM: ["FGM"],
        FGA: ["FGA"],
        "2PM": ["2PM"],
        "2PA": ["2PA"],
        "3PM": ["3PM"],
        "3PA": ["3PA"],
        FTM: ["FTM"],
        FTA: ["FTA"],
        OREB: ["OREB"],
        DREB: ["DREB"],
        TO: ["TO", "TOV"],
        PF: ["PF"],
    };
    const indexes = Object.fromEntries(
        Object.entries(aliases).map(([key, names]) => [key, findIndex(...names)]),
    );
    const numberIndex = findIndex("NUMBER", "NO", "背番号"),
        positionIndex = findIndex("POS", "POSITION", "ポジション");
    const numeric = (value) =>
        /^\s*\d+(?:\.0+)?\s*$/.test(value || "") ? Math.trunc(Number(value)) : null;
    const imported = [],
        seen = new Set();
    for (const cells of rows.slice(1)) {
        const name = (cells[nameIndex] || "").trim();
        if (!name || /^(TOTAL|合計|総計|計)$/i.test(name)) continue;
        const stats = {};
        let numericCount = 0;
        for (const [field, index] of Object.entries(indexes)) {
            if (index < 0) continue;
            const value = numeric(cells[index] || "");
            if (value !== null) {
                stats[field] = value;
                numericCount++;
            }
        }
        if (!numericCount) continue;
        const key = name.toLocaleLowerCase();
        if (seen.has(key))
            throw new Error(`「${name}」が複数行あります。選手を1行にまとめてください。`);
        seen.add(key);
        imported.push({
            name,
            number: numberIndex < 0 ? 0 : numeric(cells[numberIndex] || "") || 0,
            position: positionIndex < 0 ? "" : (cells[positionIndex] || "").trim(),
            stats,
        });
    }
    if (!imported.length)
        throw new Error(
            "選手のスタッツ行を読み取れませんでした。PLAYER列とスタッツ列を確認してください。",
        );
    return imported;
}

/** CSV文字列を移行API向けのスタッツ行に変換します。 */
function parseStatsCsv(text) {
    return parsePlayerRows(parseCsv(text));
}

/** 対応する表計算の日付形式をISO形式（yyyy-MM-dd）へそろえます。 */
function normalizeImportDate(value) {
    const input = String(value || "").trim();
    let match = input.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
    if (match) {
        const [, year, month, day] = match;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }

    match = input.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (match) {
        const [, month, day, year] = match;
        return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
    return "";
}

/**
 * 表計算のCSVから選手合計または試合ごとの履歴を読み取ります。
 * @param {string} text 管理者が選択したCSV文字列
 * @returns {{multi: boolean, players?: Array<object>, matches?: Array<object>}} 解析済みの取り込みデータ
 */
/** スプレッドシート移行用CSVを解析し、画面へ渡す共通形式を返します。 */
function parseMigrationCsv(text) {
    const rows = parseCsv(text);
    if (rows.length < 2) throw new Error("CSVにデータ行がありません。");
    const headers = rows[0].map((h) =>
        h
            .replace(/^\uFEFF/, "")
            .trim()
            .toUpperCase()
            .replace(/[\s_ -]+/g, ""),
    );
    const index = (...names) => headers.findIndex((h) => names.includes(h));
    const dateIndex = index("DATE", "日付", "試合日"),
        opponentIndex = index("OPPONENT", "相手", "対戦相手");
    if (dateIndex < 0 || opponentIndex < 0) return { multi: false, players: parsePlayerRows(rows) };
    const compIndex = index("COMPETITION", "TOURNAMENT", "大会", "大会名"),
        roundIndex = index("ROUND", "ラウンド"),
        scoreIndex = index("OPPONENTSCORE", "OPPSCORE", "相手得点");
    const grouped = new Map();
    for (const cells of rows.slice(1)) {
        if (cells.every((value) => !String(value || "").trim())) continue;
        const date = normalizeImportDate(cells[dateIndex]),
            opponent = String(cells[opponentIndex] || "").trim();
        if (!date || !opponent)
            throw new Error("複数試合CSVでは各選手の行に DATE と OPPONENT が必要です。");
        const competitionName = compIndex < 0 ? "" : String(cells[compIndex] || "").trim(),
            round = roundIndex < 0 ? "" : String(cells[roundIndex] || "").trim();
        const key = [
            date,
            opponent.toLocaleLowerCase(),
            competitionName.toLocaleLowerCase(),
            round.toLocaleLowerCase(),
        ].join("|");
        if (!grouped.has(key))
            grouped.set(key, {
                date,
                opponent,
                competitionName,
                round,
                rows: [rows[0]],
                scores: new Set(),
            });
        const group = grouped.get(key);
        group.rows.push(cells);
        if (scoreIndex >= 0 && String(cells[scoreIndex] || "").trim())
            group.scores.add(String(cells[scoreIndex]).trim());
    }
    const matches = [...grouped.values()].map((group) => {
        if (group.scores.size > 1)
            throw new Error(`${group.date} ${group.opponent} の相手得点が行ごとに異なります。`);
        const match = {
            date: group.date,
            opponent: group.opponent,
            competitionName: group.competitionName,
            round: group.round,
            players: parsePlayerRows(group.rows),
        };
        if (group.scores.size) match.opponentScore = Number([...group.scores][0]);
        return match;
    });
    if (!matches.length) throw new Error("取り込める試合がありません。");
    return { multi: true, matches };
}

/** カンマや改行などでセルが分割される値だけをCSV用に引用符で囲みます。 */
function csvCell(value) {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** 試投がない場合はダッシュを返し、それ以外は成功率を表示用に整えます。 */
function ratio(made, attempted) {
    return attempted ? `${((made / attempted) * 100).toFixed(1)}%` : "—";
}

/** ボックススコアの合計からEFF（効率値）を計算します。 */
function eff(stats) {
    return (
        (stats.points || 0) +
        (stats.REB || 0) +
        (stats.AST || 0) +
        (stats.STL || 0) +
        (stats.BLK || 0) -
        ((stats.FGA || 0) - (stats.FGM || 0)) -
        ((stats.FTA || 0) - (stats.FTM || 0)) -
        (stats.TO || 0)
    );
}
