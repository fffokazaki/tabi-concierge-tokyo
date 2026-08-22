/**
 * D1 へ 1 文の読み取り SQL を投げ、結果行だけを標準出力へ出す（Issue #189）。
 *
 * このプロジェクトは絶対ルール #1 に「推測で埋めない」を置いており、実データを
 * 確かめる回数が多いほど品質が上がる構造になっている。ところが `wrangler d1 execute` の
 * 出力を**パイプへ渡すと**（＝人が端末で読む形ではなく、スクリプトやエージェントが読む形）、
 * バナーと実行メタ情報（duration / rows_read / size_after …）が結果行を押し出す。
 * 端末で直接叩いたときは整形テーブルが出るのでこの症状は見えない（wrangler 4.123.0 で確認）。
 * 読むたびに `--json` とパイプを組み立てることになっていたので、1 コマンドに畳む。
 *
 * 実行例:
 *   npm run --silent db:query -- "SELECT COUNT(*) AS n FROM spots"   # 本番（--remote）
 *   npm run --silent db:query:local -- "SELECT COUNT(*) AS n FROM spots"
 *
 * `--silent` は npm 自身が stdout に出す 2 行のヘッダ（`> tabi-concierge-tokyo@0.1.0 …`）を
 * 止めるためのもの。付けなくても wrangler のバナーとメタ情報は出ないが、標準出力を
 * そのまま別のコマンドへ渡すなら付ける。
 *
 * **wrangler は `npm run` 経由の PATH（node_modules/.bin）で解決している。**
 * `node scripts/db/query.ts …` と直に叩くと環境によっては見つからない。
 *
 * ## 終了コード
 *
 * | コード | 意味 | stdout |
 * | --- | --- | --- |
 * | 0 | 照会が成立した（0 行でも 0） | 結果行の JSON |
 * | 1 | 照会が失敗した（wrangler の失敗・応答が読めない） | **空** |
 * | 2 | 使い方の誤り（引数・SQL の形） | **空** |
 *
 * wrangler 自身の終了コードは 1 へ畳んで stderr のメッセージに載せる。素通しすると
 * 「wrangler が 2 で終わった」と「使い方の誤り」が区別できなくなるため。
 *
 * ## 受け付けるのは単一の読み取り文だけ
 *
 * `findSqlProblem` が **wrangler を起動する前に** SQL を検査し、`SELECT` / `WITH` で始まる
 * 1 文以外を拒否する。既定の接続先が本番 D1 であり、`SELECT 1; DELETE FROM gaps` の
 * 2 文目が実際に実行されることは Issue #118 で実測済みだから（`worker/core/llm.ts` の doc）。
 * wrangler 側も複文を実行する（ローカルは `db.batch()`、リモートは D1 API へ素通し）。
 * 検査を応答の解析まで遅らせると、気づいたときには消えている。しかも `gaps`（未回答ログ）は
 * 実行時に溜まる資産で、`npm run db:seed` では復旧しない。
 *
 * **これは人が打つ SQL 向けの検査で、`worker/core/sql-guard.ts` とは別物。** あちらは LLM が
 * 書いた SQL 用に `spots` / `datasets` しか通さないが、こちらは点検に使う `gaps`
 * （DEPLOYMENT.md §3 の確認手順）を通す必要がある。共有すると片方の都合でもう片方が
 * 緩むため、意図して分けている。
 *
 * 止めるのは書き込み文の実行だけで、重いクエリも情報の読み出しも止めない。
 *
 * ## 失敗したときは stdout に何も書かない
 *
 * ここで言う stdout は**このスクリプトの出力**で、`--silent` 無しで呼んだときの npm の
 * ヘッダ 2 行は含まない。空の結果として読める `[]` を出してしまうと、「照会が失敗した」と「行が 0 件だった」の
 * 区別が消え、このプロジェクトが最も嫌う偽の未回答をツール側で作ることになる。
 */
import { spawnSync } from "node:child_process";

import { isDirectExecution } from "../lib/direct-execution.ts";

// `process` はグローバルを使う（`import * as process` だと名前空間オブジェクトが
// 読み取り専用で、下の `process.exitCode = …` が TypeError になる）。

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE_ERROR = 2;

/** wrangler.jsonc の d1_databases[].database_name と同じ。 */
export const DATABASE_NAME = "tabi-concierge-tokyo";

/**
 * 子プロセスの stdout を受け取る上限。
 *
 * Node の既定は 1 MiB で、`SELECT * FROM spots`（1,645 行）の整形済み JSON はその桁に届く。
 * 超えると `spawnSync` は子プロセスを kill して ENOBUFS を返すため、**照会は走ったのに
 * 「起動できなかった」ように見える**。読むためのツールなので上限は広く取る。
 */
const MAX_BUFFER_BYTES = 64 * 1024 * 1024;

/**
 * wrangler の応答を待つ上限。
 *
 * CLAUDE.md はこのコマンドをエージェントにも案内する。人と違って Ctrl-C で抜けられないので、
 * 無応答は待ち続けずに打ち切って「完了しなかった」と言う（0 件ではない）。
 */
const TIMEOUT_MS = 60_000;

/** wrangler へそのまま渡す接続先フラグ。 */
export type Target = "--remote" | "--local";

const USAGE = `使い方: npm run --silent db:query -- "SELECT COUNT(*) AS n FROM spots"（ローカルは db:query:local）`;

/**
 * npm script が付ける接続先フラグと、`--` 以降に渡された SQL を取り出す。
 *
 * SQL は必ず 1 引数。クォート無しで渡すとシェルが空白で単語分割して複数引数に割れるため、
 * 黙って連結せず止める（`*` を含むと bash ではグロブ展開も起きる。zsh は
 * `no matches found` でコマンド自体が起動しないので、このメッセージまで届かない）。
 */
export function parseArgs(argv: string[]): { target: Target; sql: string } | { problem: string } {
  // argv が空なら undefined。型は string と名乗るが実態はこちら。
  const target: string | undefined = argv[0];
  const rest = argv.slice(1);

  if (target !== "--remote" && target !== "--local") {
    return {
      problem: `接続先（--remote / --local）が先頭に無い。npm script の定義が壊れている可能性がある。受け取った引数: ${JSON.stringify(argv)}`,
    };
  }
  if (rest.length === 0) {
    return { problem: `SQL が渡されていない。${USAGE}` };
  }
  if (rest.length > 1) {
    // `npm run db:query -- --local "SELECT 1"` は接続先を足したつもりの呼び方。
    // クォート忘れと同じ「引数が割れている」形になるが、案内すべき内容は別。
    const stray = rest.find((arg) => arg === "--remote" || arg === "--local");
    if (stray !== undefined) {
      return {
        problem: `接続先は npm script 側で決まっているので ${stray} を足しても切り替わらない。ローカルを見るなら db:query:local を使う。${USAGE}`,
      };
    }
    return {
      problem: `SQL が ${rest.length} 個の引数に割れている（クォートで囲まないとシェルが空白で分割する）。${USAGE}`,
    };
  }
  if (rest[0].trim() === "") {
    return { problem: `SQL が空。${USAGE}` };
  }

  return { target, sql: rest[0] };
}

/**
 * 文字列リテラルと行/ブロックコメントを、同じ長さの空白へ潰す。
 *
 * **走査の前に必ずこれを通す。** 潰さないと `'a;b'` のセミコロンを複数文と誤判定したり、
 * 逆にコメントの中へ書き込み語を隠されたりする。長さを保つのは元の SQL と位置が
 * ずれないようにするため。
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

/**
 * 読み取り文の中に現れてよい理由が無い語。
 *
 * **先頭の語の判定と対で必要。** SQLite は `WITH x AS (…) DELETE FROM …` を受け付けるので、
 * 「SELECT / WITH で始まる」だけでは書き込みを防げない。
 */
const WRITE_KEYWORDS = [
  "insert", "update", "delete", "drop", "alter", "create", "replace", "truncate",
  "attach", "detach", "pragma", "vacuum", "reindex", "begin", "commit", "rollback",
  "savepoint",
];

/**
 * wrangler を起動してよい SQL かを調べる。問題が無ければ null。
 *
 * 判断に迷ったら通さない（fail closed）。書き込みが必要なときはこのコマンドではなく
 * `wrangler d1 execute` を直接使う。
 */
export function findSqlProblem(sql: string): string | null {
  // 文字列リテラルとコメントを潰した像だけを見る。位置は元の SQL と 1:1 で対応する。
  const scrubbed = scrub(sql);
  // 末尾のセミコロン 1 個は書き方の揺れとして許す（`SELECT 1;`）。
  const body = scrubbed.trimEnd().replace(/;\s*$/, "");

  if (body.includes(";")) {
    return "セミコロンで区切った複数文は受け付けない（wrangler も D1 も 2 文目を実行する）。1 文ずつ実行する";
  }
  if (body.trim() === "") {
    return `SQL に実体が無い（コメントだけ、など）。${USAGE}`;
  }
  if (!/^\s*(select|with)\b/i.test(body)) {
    return "読み取り文（SELECT / WITH で始まる 1 文）だけを受け付ける。書き込みが必要なら wrangler d1 execute を直接使う";
  }
  const found = WRITE_KEYWORDS.find((keyword) => new RegExp(`\\b${keyword}\\b`, "i").test(body));
  if (found !== undefined) {
    return `書き込み系のキーワード \`${found}\` が含まれている。読み取り文だけを受け付ける`;
  }

  return null;
}

/**
 * `wrangler d1 execute --json` の stdout から結果行だけを取り出す。
 *
 * 応答は「文ごとの結果」が並ぶ平らな配列（2026-08-22 実測。複数文を送ると要素が増える）。
 * 複数文は `findSqlProblem` が実行前に弾いているので、ここで 2 要素以上になるのは応答の形が
 * 想定と違うときだけ。**この検査は破壊を止める役割を持たない** — 1 文目だけを黙って
 * 返さないためのものである。
 */
export function extractRows(stdout: string): { rows: unknown[] } | { problem: string } {
  if (stdout.trim() === "") {
    return { problem: "wrangler が正常終了したのに stdout へ何も書かなかった（0 件ではない）" };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch (cause) {
    return {
      problem: `wrangler の出力を JSON として読めなかった（${(cause as Error).message}）。下に生の出力を出す`,
    };
  }

  if (!Array.isArray(payload)) {
    return {
      problem: "wrangler の出力が文ごとの結果の配列ではない（失敗の応答である可能性が高い。下に生の出力を出す）",
    };
  }
  if (payload.length === 0) {
    return { problem: "wrangler が 1 文も実行しなかった（結果が空配列）" };
  }
  if (payload.length > 1) {
    return {
      problem: `${payload.length} 文ぶんの結果が返った。1 文しか送っていないので、応答の形が想定と違う`,
    };
  }

  const entry = payload[0] as { results?: unknown; success?: unknown } | null;
  if (entry?.success !== true) {
    return {
      problem: `wrangler が success: true を返さなかった（success は ${JSON.stringify(entry?.success)}）。下に生の出力を出す`,
    };
  }
  if (!Array.isArray(entry.results)) {
    return { problem: "wrangler の応答に results 配列が無い（下に生の出力を出す）" };
  }

  return { rows: entry.results };
}

/** wrangler の実行結果。`spawnSync` の戻り値のうち、このツールが見る部分だけ。 */
export interface WranglerResult {
  status: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
  /** 起動できなかった / 打ち切った（ENOENT・ENOBUFS・ETIMEDOUT など）。 */
  error?: Error;
}

export type WranglerRunner = (target: Target, sql: string) => WranglerResult;

/** このコマンドが最終的に出すもの。stdout は失敗経路では必ず空文字。 */
export interface CliOutcome {
  stdout: string;
  stderr: string[];
  exitCode: number;
}

/** `spawnSync` が error に載せる原因を、利用者が次に打つ手へ翻訳する。 */
function describeSpawnError(error: Error): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOBUFS") {
    return `wrangler の出力が上限（${MAX_BUFFER_BYTES} バイト）を超えたので打ち切った。照会自体は走っている（0 件ではない）。LIMIT を付けて絞る`;
  }
  if (code === "ETIMEDOUT") {
    return `wrangler が ${TIMEOUT_MS} ミリ秒で応答しなかったので打ち切った。照会が完了したかは分からない（0 件ではない）`;
  }
  return `wrangler を起動できなかった（${code ?? "code 不明"}）: ${error.message}`;
}

/**
 * 入口から出口までを 1 つの関数にまとめる（wrangler の起動だけを外から渡す）。
 *
 * 「失敗したら stdout に何も書かない」はこのツールの中心的な契約なので、実際に
 * wrangler を起動せずに全経路を検証できるようにしてある。
 */
export function runQuery(argv: string[], runWrangler: WranglerRunner): CliOutcome {
  const parsed = parseArgs(argv);
  if ("problem" in parsed) {
    return { stdout: "", stderr: [`[db:query] ${parsed.problem}`], exitCode: EXIT_USAGE_ERROR };
  }

  const sqlProblem = findSqlProblem(parsed.sql);
  if (sqlProblem !== null) {
    return { stdout: "", stderr: [`[db:query] ${sqlProblem}`], exitCode: EXIT_USAGE_ERROR };
  }

  const run = runWrangler(parsed.target, parsed.sql);

  // wrangler が stderr へ書いたものは、どの経路でも捨てない。原因究明に一番効く。
  const stderr: string[] = [];
  if (run.stderr.trim()) stderr.push(run.stderr.trimEnd());

  if (run.error) {
    stderr.push(`[db:query] ${describeSpawnError(run.error)}`);
    return { stdout: "", stderr, exitCode: EXIT_FAILED };
  }

  if (run.status !== 0) {
    // wrangler は失敗の中身（`no such table: …`）も stdout に書く。標準出力へ素通しすると
    // 結果行と区別が付かないので、失敗ぶんはすべて stderr へ回す。
    if (run.stdout.trim()) stderr.push(run.stdout.trimEnd());
    stderr.push(
      `[db:query] wrangler が失敗した（${run.status === null ? `signal ${run.signal}` : `exit ${run.status}`}）`,
    );
    return { stdout: "", stderr, exitCode: EXIT_FAILED };
  }

  const extracted = extractRows(run.stdout);
  if ("problem" in extracted) {
    stderr.push(`[db:query] ${extracted.problem}`);
    if (run.stdout.trim()) stderr.push(run.stdout.trimEnd());
    return { stdout: "", stderr, exitCode: EXIT_FAILED };
  }

  return { stdout: JSON.stringify(extracted.rows), stderr, exitCode: EXIT_OK };
}

const spawnWrangler: WranglerRunner = (target, sql) => {
  const run = spawnSync(
    "wrangler",
    ["d1", "execute", DATABASE_NAME, target, "--json", "--command", sql],
    { encoding: "utf8", maxBuffer: MAX_BUFFER_BYTES, timeout: TIMEOUT_MS },
  );
  return {
    status: run.status,
    signal: run.signal,
    stdout: run.stdout ?? "",
    stderr: run.stderr ?? "",
    error: run.error,
  };
};

export function main(argv: string[]): number {
  const outcome = runQuery(argv, spawnWrangler);
  for (const line of outcome.stderr) console.error(line);
  if (outcome.stdout !== "") console.log(outcome.stdout);
  return outcome.exitCode;
}

// process.exit は保留中の書き込みを待たないため、パイプへ渡した結果が途中で切れる。
// 終了コードだけ立てて、Node に出力を出し切らせてから終わらせる。
if (isDirectExecution(import.meta.url, process.argv[1])) {
  process.exitCode = main(process.argv.slice(2));
}
