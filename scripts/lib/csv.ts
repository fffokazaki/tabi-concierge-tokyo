/**
 * CSV パーサ。
 *
 * 素朴な `split(",")` では壊れる。取り込む実データには
 * 引用符で囲まれたフィールド（文化財一覧）が含まれ、その中にカンマや改行が入りうるため。
 * 依存を増やさずに済む規模なので自前で持ち、振る舞いはテストで固定する。
 */

/** RFC 4180 準拠の最小実装。区切りはカンマ、引用符は `"`、`""` でエスケープ。 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // 改行は fetch 時に \n へ正規化済みだが、単体でも壊れないよう \r も食う
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < src.length) {
    const ch = src[i];

    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }
    if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      i++;
      continue;
    }
    field += ch;
    i++;
  }

  // 最終フィールド。末尾が改行で終わる場合に空行を足さない
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** ヘッダ行をキーにしたレコード列にする。ヘッダの前後空白は落とす。 */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((key, idx) => {
      rec[key] = (r[idx] ?? "").trim();
    });
    return rec;
  });
}
