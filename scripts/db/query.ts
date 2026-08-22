/**
 * D1 へ 1 文の SQL を投げ、結果行だけを標準出力へ出す（Issue #189）。
 *
 * このプロジェクトは絶対ルール #1 に「推測で埋めない」を置いており、実データを
 * 確かめる回数が多いほど品質が上がる構造になっている。ところが `wrangler d1 execute` の
 * 既定出力はバナーと実行メタ情報（duration / rows_read / size_after …）が結果行を
 * 押し出すため、読むたびに `--json` とパイプを組み立てることになっていた。実測の手数が
 * そのままルールの遵守コストになっていたので、1 コマンドに畳む。
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
 * 失敗したときは stdout に何も書かない。空の結果として読める `[]` を出してしまうと、
 * 「照会が失敗した」と「行が 0 件だった」の区別が消え、このプロジェクトが最も嫌う
 * 偽の未回答をツール側で作ることになる。
 */
import { spawnSync } from "node:child_process";
import * as process from "node:process";

const EXIT_OK = 0;
const EXIT_FAILED = 1;
const EXIT_USAGE_ERROR = 2;

/** wrangler.jsonc の d1_databases[].database_name と同じ。 */
export const DATABASE_NAME = "tabi-concierge-tokyo";

/** wrangler へそのまま渡す接続先フラグ。 */
export type Target = "--remote" | "--local";

const USAGE = `使い方: npm run --silent db:query -- "SELECT COUNT(*) AS n FROM spots"（ローカルは db:query:local）`;

/**
 * npm script が付ける接続先フラグと、`--` 以降に渡された SQL を取り出す。
 *
 * SQL は必ず 1 引数。`SELECT COUNT(*) …` をクォート無しで渡すとシェルが `*` を展開して
 * 複数引数に割れるため、黙って連結せず「クォートで囲め」と言って止める。
 */
export function parseArgs(argv: string[]): { target: Target; sql: string } | { problem: string } {
  const [target, ...rest] = argv;

  if (target !== "--remote" && target !== "--local") {
    return {
      problem: `接続先（--remote / --local）が先頭に無い。npm script の定義が壊れている可能性がある。受け取った引数: ${JSON.stringify(argv)}`,
    };
  }
  if (rest.length === 0) {
    return { problem: `SQL が渡されていない。${USAGE}` };
  }
  if (rest.length > 1) {
    return {
      problem: `SQL が ${rest.length} 個の引数に割れている（クォートで囲み忘れると \`*\` をシェルが展開する）。${USAGE}`,
    };
  }
  if (rest[0].trim() === "") {
    return { problem: `SQL が空。${USAGE}` };
  }

  return { target, sql: rest[0] };
}

/**
 * `wrangler d1 execute --json` の stdout から結果行だけを取り出す。
 *
 * 応答は「文ごとの結果」の配列。1 文ぶんだけを扱い、複数文は受け付けない
 * （1 文なら `[{...}]`、複数文なら `[[{...}],[{...}]]` と形が変わってしまい、
 * 出力を受け取る側が読み分けられないため）。
 */
export function extractRows(stdout: string): { rows: unknown[] } | { problem: string } {
  let payload: unknown;
  try {
    payload = JSON.parse(stdout);
  } catch {
    return { problem: "wrangler の出力を JSON として読めなかった（下に生の出力を出す）" };
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
      problem: `${payload.length} 文ぶんの結果が返った。このコマンドは 1 文ずつ実行する（複数文だと出力の形が変わる）`,
    };
  }

  const entry = payload[0] as { results?: unknown; success?: unknown } | null;
  if (entry?.success !== true) {
    return { problem: "wrangler が success: true を返さなかった（下に生の出力を出す）" };
  }
  if (!Array.isArray(entry.results)) {
    return { problem: "wrangler の応答に results 配列が無い（下に生の出力を出す）" };
  }

  return { rows: entry.results };
}

export function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if ("problem" in parsed) {
    console.error(`[db:query] ${parsed.problem}`);
    return EXIT_USAGE_ERROR;
  }

  const run = spawnSync(
    "wrangler",
    ["d1", "execute", DATABASE_NAME, parsed.target, "--json", "--command", parsed.sql],
    { encoding: "utf8" },
  );

  if (run.error) {
    console.error(`[db:query] wrangler を起動できなかった: ${run.error.message}`);
    return EXIT_FAILED;
  }

  const stdout = run.stdout ?? "";
  if (run.stderr?.trim()) console.error(run.stderr.trimEnd());

  if (run.status !== 0) {
    // wrangler は失敗の中身（`no such table: …` など）も stdout に書く。標準出力へ
    // 素通しすると結果行と区別が付かないので、失敗ぶんはすべて stderr へ回す。
    if (stdout.trim()) console.error(stdout.trimEnd());
    console.error(
      `[db:query] wrangler が失敗した（${run.status === null ? `signal ${run.signal}` : `exit ${run.status}`}）`,
    );
    return run.status ?? EXIT_FAILED;
  }

  const extracted = extractRows(stdout);
  if ("problem" in extracted) {
    console.error(`[db:query] ${extracted.problem}`);
    if (stdout.trim()) console.error(stdout.trimEnd());
    return EXIT_FAILED;
  }

  console.log(JSON.stringify(extracted.rows));
  return EXIT_OK;
}

if (import.meta.filename === process.argv[1]) {
  process.exit(main(process.argv.slice(2)));
}
