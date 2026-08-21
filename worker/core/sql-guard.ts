/**
 * 生成 SQL の静的検証（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）。
 *
 * ## ここが唯一の防御線である
 *
 * 当初のプランは「3層封じ込め」を想定していた。2層目は「`db.prepare()` は複文を受けないので、
 * 検証をすり抜けた複文もそこで止まる」というものだったが、**実測で成り立たないことが分かった**
 * （Issue #118・`worker/core/llm.ts` の doc と `llm.test.ts` に記録）:
 *
 * | 渡した SQL | 起きたこと |
 * | --- | --- |
 * | `SELECT 1; DELETE FROM gaps` | **複文の2文目が実行され、行が消えた** |
 * | `DELETE FROM gaps` | 実行された |
 * | `PRAGMA table_list` / `SELECT ... FROM sqlite_master` | スキーマ・内部テーブル名が読めた |
 * | `SELECT ...; DROP TABLE gaps` | 拒否（DDL だけは D1 が止める） |
 *
 * **したがってここを通り抜けたものは、そのまま D1 で実行される。** 「後段でも見ているから」
 * という理由で緩めないこと。MASTER.md のセキュリティ要件「生成したクエリが同梱データ以外へ
 * 到達しないこと」を実際に担保しているのは、このファイルと `sql-guard.test.ts` である。
 *
 * ## 設計方針: 許可するものを列挙する
 *
 * 危険なものを列挙する（denylist）形にすると、知らない書き方が**黙って通る**。
 * SELECT だけ・許可テーブルだけ、と許可側を書く。判断に迷ったら通さない（fail closed）。
 *
 * 完全な純関数。LLM にも D1 にも依存しないので、攻撃ケースを列挙したテストがそのまま
 * 防御の証明になる。
 */

/** 読んでよいテーブル。ここに無いものは名前を知っていても通さない。 */
export const ALLOWED_TABLES = ["spots", "datasets"] as const;

/**
 * 1回の照会で返してよい行数の上限。
 *
 * 使うのは1行だけだが、`LIMIT 1` を強制すると LLM が `ORDER BY` で絞る書き方をしたときに
 * 意図した行が落ちる。上限だけ決めて、行の選択は生成側に委ねる。
 */
export const MAX_LIMIT = 50;

/**
 * 書けない語。SELECT 文の中に現れてよい理由が無いものだけを並べる。
 *
 * DDL（DROP 等）は D1 自身も拒否するが、**それに寄りかからない**。D1 の実装依存であって
 * 保証された仕様として確認したわけではないため（Issue #118 の実測メモ参照）。
 */
const FORBIDDEN_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "replace", "truncate",
  "attach", "detach", "pragma", "vacuum", "reindex", "analyze", "begin", "commit",
  "rollback", "savepoint", "grant", "revoke", "load_extension", "readfile", "writefile",
];

/**
 * 名前を知っていても触らせないもの。**これは主たる壁ではない。**
 *
 * `FROM` / `JOIN` を経由するテーブル参照は、下の許可リスト（`ALLOWED_TABLES`）が全部捕まえる。
 * 実際、この検査を無効化しても `sql-guard.test.ts` は全件通る — つまり通常の攻撃経路では
 * ここまで到達しない。**「2枚あるから片方は緩くてよい」と読まないこと。**
 *
 * ここが受け持つのは、`FROM` 走査の視野に入らない位置に現れた参照だけである
 * （`SELECT gaps.question FROM spots` のような列修飾）。正規表現ベースの `FROM` 走査に
 * 取りこぼしがあったときの受け皿でもある。
 *
 * 対象の根拠: `sqlite_master` は実測で読めてしまい、`d1_migrations` や `_cf_METADATA` と
 * いった内部テーブル名まで見えた（Issue #118）。`gaps` は未回答ログで、オープンデータでは
 * ない（ADR-007 の用途2）。どちらも「同梱データ」ではないので回答の材料になってはいけない。
 */
const FORBIDDEN_IDENTIFIER_PATTERN = /\b(sqlite_[a-z_]*|_cf_[a-z_]*|d1_[a-z_]*|gaps)\b/i;

export type GuardResult =
  | { ok: true; sql: string }
  | { ok: false; reason: string };

const reject = (reason: string): GuardResult => ({ ok: false, reason });

/**
 * 文字列リテラルとコメントを同じ長さの空白へ潰す。
 *
 * **走査の前に必ずこれを通す。** 潰さないと、ブロックコメントの中に禁止語やセミコロンを
 * 隠す書き方や、文字列リテラルの中にコメント開始記号を置く書き方で、キーワード検査も
 * セミコロン検査もすり抜けられる（`sql-guard.test.ts` の「コメント偽装」を参照）。
 * 長さを保つのは、元の SQL との位置対応を崩さないため（エラー位置の報告に使える）。
 */
function scrub(sql: string): string {
  const out = sql.split("");
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      while (i < sql.length && sql[i] !== "\n") out[i++] = " ";
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      while (i < stop) out[i++] = " ";
      continue;
    }
    if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      out[i++] = " ";
      while (i < sql.length) {
        if (sql[i] === quote) {
          out[i++] = " ";
          // '' / "" は閉じではなくエスケープ。潰したうえで文字列の中に留まる
          if (sql[i] === quote) {
            out[i++] = " ";
            continue;
          }
          break;
        }
        out[i++] = " ";
      }
      continue;
    }
    i++;
  }
  return out.join("");
}

/** `FROM` / `JOIN` が指すテーブル名を集める。カンマ区切りの複数指定も拾う。 */
function referencedTables(scrubbed: string): string[] {
  const tables: string[] = [];
  const clause = /\b(from|join)\s+([\s\S]*?)(?=\b(where|group|having|order|limit|window|union|intersect|except|join|on|using)\b|$)/gi;
  for (const match of scrubbed.matchAll(clause)) {
    for (const part of match[2]!.split(",")) {
      // `spots AS s` / `spots s` の別名を落として実体名だけを見る
      const name = part.trim().split(/\s+/)[0]?.replace(/[()]/g, "");
      if (name) tables.push(name);
    }
  }
  return tables;
}

/**
 * 生成 SQL を検証し、通してよければ（必要なら `LIMIT` を足して）返す。
 *
 * **返された `sql` を実行すること。** 入力のほうを実行すると `LIMIT` の付与が効かない。
 */
export function guardSelect(sql: string): GuardResult {
  const trimmed = sql.trim();
  if (trimmed === "") return reject("SQL が空です");

  const scrubbed = scrub(trimmed);

  // 末尾のセミコロンだけは書き方の揺れとして許し、それ以外の位置にあるものは複文とみなす。
  // 複文はこの層を抜けると本当に実行される（Issue #118 の実測）ので、ここで必ず止める
  const withoutTrailing = scrubbed.replace(/;\s*$/, "");
  if (withoutTrailing.includes(";")) {
    return reject("複数の文は実行できません（セミコロンで区切られています）");
  }

  if (!/^select\b/i.test(withoutTrailing)) {
    return reject("SELECT 文だけを実行できます");
  }

  for (const keyword of FORBIDDEN_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, "i").test(withoutTrailing)) {
      return reject(`「${keyword}」は使えません`);
    }
  }

  const forbidden = FORBIDDEN_IDENTIFIER_PATTERN.exec(withoutTrailing);
  if (forbidden) return reject(`「${forbidden[1]}」は参照できません`);

  const tables = referencedTables(withoutTrailing);
  if (tables.length === 0) return reject("参照するテーブルがありません");
  for (const table of tables) {
    if (!(ALLOWED_TABLES as readonly string[]).includes(table.toLowerCase())) {
      return reject(`テーブル「${table}」は参照できません（${ALLOWED_TABLES.join(" / ")} のみ）`);
    }
  }

  const limit = /\blimit\s+(\d+)/i.exec(withoutTrailing);
  if (limit) {
    if (Number(limit[1]) > MAX_LIMIT) return reject(`LIMIT は ${MAX_LIMIT} 以下にしてください`);
    return { ok: true, sql: trimmed.replace(/;\s*$/, "") };
  }
  // 無ければ足す。上限を超えた指定は**書き換えずに拒否する**（黙って意図を変えない）
  return { ok: true, sql: `${trimmed.replace(/;\s*$/, "")} LIMIT ${MAX_LIMIT}` };
}
