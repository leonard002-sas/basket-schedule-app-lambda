/**
 * RFC 4180 に近い一般的な CSV を二次元配列へ変換します。
 * ダブルクォート内のカンマ、改行、二重化されたダブルクォートを保持します。
 */
export function parseCsv(source: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = "";
    let quoted = false;
    const text = source.replace(/^\uFEFF/, "");

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        if (character === '"') {
            if (quoted && text[index + 1] === '"') {
                cell += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === "," && !quoted) {
            row.push(cell.trim());
            cell = "";
        } else if ((character === "\n" || character === "\r") && !quoted) {
            if (character === "\r" && text[index + 1] === "\n") index += 1;
            row.push(cell.trim());
            if (row.some(Boolean)) rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += character;
        }
    }

    row.push(cell.trim());
    if (row.some(Boolean)) rows.push(row);
    return rows;
}
