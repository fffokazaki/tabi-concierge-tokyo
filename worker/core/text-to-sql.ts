import type { AggregateDatasetInput, AggregateResult } from "../../shared/core";
import type { CatalogEntry } from "./catalog";
import type { CoreDeps } from "./llm";
import { ALLOWED_TABLES, guardSelect, MAX_LIMIT } from "./sql-guard";

/**
 * Text-to-SQL（[Issue #119](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/119)）。
 *
 * LLM に SQL を書かせ、`sql-guard` を通してから D1 の `spots` を実照会する。
 *
 * ## LLM は行の中身に触れない
 *
 * LLM の仕事は **SQL を書くことだけ**で、返ってきた行から応答を組み立てるのは決定的な
 * テンプレート（`toResult`）である。出典強制（DOMAIN.md §8・ADR-011）は「事実の出所は
 * オープンデータであって LLM ではない」という要求なので、行の内容を LLM に要約させたら
 * その時点で崩れる。**この分担がこのファイルの設計の芯である。**
 *
 * ## 2枚の壁は独立している
 *
 * | 壁 | 何を見るか | 偽装できるか |
 * | --- | --- | --- |
 * | `sql-guard`（構文） | SELECT のみ・許可テーブルのみ・複文なし | 書き方の工夫で抜けうる。だから2枚目が要る |
 * | 行の検証（意味） | **返ってきた全行の `dataset_id` が入力と一致するか** | 生成 SQL からは偽装できない |
 *
 * `WHERE dataset_id = '...'` が SQL 文字列に含まれるかを見る、という検査は**しない**。
 * `WHERE dataset_id = 'X' OR 1=1` が通ってしまい、「守っているつもり」の分岐になるため
 * （Issue #118 で同じ型の誤りを1つ撤去した）。実際に返ってきた行を見るほうが、
 * 短く書けて偽装もできない。
 */

/** LLM が SQL を書き直せる回数。1回目 ＋ 再生成2回 = 最大3回の推論。 */
export const MAX_SQL_ATTEMPTS = 3;

/** SQL は短い。長く書かせる理由が無く、出力トークンは入力の約6.4倍の単価がかかる。 */
const SQL_MAX_TOKENS = 300;

/**
 * 検証に**必須**の列。ここが欠けたら書き直させる。
 *
 * `dataset_id` は行の検証（別データセット混入の検出）に、`name` は応答の組み立てに要る。
 */
const REQUIRED_COLUMNS = ["dataset_id", "name"] as const;

/**
 * 要約を豊かにするために**お願いする**列。欠けても書き直しは求めない。
 *
 * 実モデルは「必ず含める」と書いた列だけを選ぶ（実測 — `dataset_id, name` しか書かなかった）。
 * 要約から所在地が落ちるだけで応答としては成立するので、必須にはせずここで頼む。
 */
const PREFERRED_COLUMNS = ["address", "note"] as const;

const SYSTEM_PROMPT = [
  "あなたは SQLite の SELECT 文だけを書くアシスタントです。",
  "出力は SQL 文のみ。説明・コードフェンス・前置きを一切付けないでください。",
].join("\n");

/**
 * スキーマと制約を渡すプロンプト。
 *
 * **可変要素（タイムスタンプ・乱数・実行回数など）を入れないこと。** AI Gateway の
 * キャッシュキーはリクエストボディ全体なので、入れた瞬間に同じ問いでもキャッシュが
 * 効かなくなる（ADR-013 決定4）。`intent` と `datasetId` は問いそのものなので可変でよい。
 */
function buildPrompt(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  facets: Facets,
  previousError?: string,
): string {
  const lines = [
    "## テーブル",
    "spots(id INTEGER, dataset_id TEXT, name TEXT, category TEXT, area TEXT, address TEXT, lat REAL, lon REAL, note TEXT, source_row INTEGER)",
    "datasets(id TEXT, no INTEGER, title TEXT, publisher TEXT, license TEXT, catalog_url TEXT, retrieved_at TEXT, update_frequency TEXT, row_count INTEGER, has_spots INTEGER)",
    "",
    "## この dataset_id の行に実際に入っている値",
    // **推測させない。** カタログのメタデータは category の具体値を持たないので、
    // D1 から実測して渡す。これが無いと LLM は「寺社」のような一般語で絞ろうとし、
    // 実際の値（「名所・史跡」）に当たらず0行になる（実モデルで確認・Issue #119）
    `- category: ${facets.categories.length > 0 ? `「${facets.categories.join("」「")}」` : "（不明）"}`,
    `- area: ${facets.areas.length > 0 ? `「${facets.areas.join("」「")}」` : "（該当なし）"}。対象エリア外の行は NULL`,
    "- note は空文字のことがある",
    "",
    "## 制約",
    `- ${ALLOWED_TABLES.join(" と ")} 以外のテーブルを参照しない`,
    "- SELECT 文を1つだけ書く（セミコロンで区切って複数書かない）",
    `- WHERE 句で dataset_id = '${entry.datasetId}' に必ず限定する`,
    `- SELECT する列に ${[...REQUIRED_COLUMNS, ...PREFERRED_COLUMNS].join(", ")} をすべて含める`,
    `- LIMIT は ${MAX_LIMIT} 以下にする`,
    "",
    "## 取り出したいもの",
    input.intent,
  ];
  if (previousError) {
    lines.push(
      "",
      "## 直前の試行は次の理由で拒否されました。直して書き直してください",
      previousError,
    );
  }
  return lines.join("\n");
}

/** ```sql ... ``` で囲って返してくる場合があるので、素の SQL に戻す。 */
function unwrap(text: string): string {
  const fenced = /```(?:sql)?\s*([\s\S]*?)```/i.exec(text);
  return (fenced?.[1] ?? text).trim();
}

/** その dataset_id の行に実際に入っている値。プロンプトへ渡すために D1 から読む。 */
type Facets = { categories: string[]; areas: string[] };

/** `DISTINCT` の取り出しは1列につき最大この件数まで。プロンプトが膨らむと入力単価に効く。 */
const MAX_FACET_VALUES = 20;

/**
 * `category` / `area` の実在値を D1 から読む。**LLM は使わない**（推論回数を増やさない）。
 *
 * SQL に埋める `dataset_id` は `entry.datasetId`（カタログの定数）であって、利用者入力の
 * `input.datasetId` ではない。`findEntry` が一致を確かめた後なので値は同じだが、
 * **SQL 文字列へ差し込む値は自分が持つ既知の定数から取る**という形にしておく。
 *
 * 読めなかったら空で続ける。ここが取れなくても SQL 生成そのものは成立する
 * （当たりにくくなるだけ）ので、回答経路を落とす理由にはしない。
 */
async function readFacets(entry: CatalogEntry, deps: CoreDeps): Promise<Facets> {
  const distinct = async (column: "category" | "area"): Promise<string[]> => {
    const result = await deps.sql.select(
      `SELECT DISTINCT ${column} AS value FROM spots WHERE dataset_id = '${entry.datasetId}' AND ${column} IS NOT NULL LIMIT ${MAX_FACET_VALUES}`,
    );
    if (!result.ok) return [];
    return result.rows
      .map((row) => row["value"])
      .filter((value): value is string => typeof value === "string" && value.trim() !== "");
  };
  const [categories, areas] = await Promise.all([distinct("category"), distinct("area")]);
  return { categories, areas };
}

export type TextToSqlOutcome =
  /** 実照会で行が取れた。`query` には**実際に実行した SQL** を入れる */
  | { kind: "answered"; result: AggregateResult; query: string }
  /** SQL は成功したが0行。これは障害ではなく、正当な「答えられない」（記録の対象） */
  | { kind: "empty"; sql: string }
  /** インフラ障害・出力不正。**縮退してキーワード実装に戻る**（記録の対象にしない） */
  | { kind: "failed"; cause: string };

/**
 * 行から応答を決定的に組み立てる。
 *
 * **足りない材料は書かない。** `address` が NULL のときに「所在地は不明」のような一文を
 * 足すと、データに無いことを述べたことになる（絶対ルール #1）。短い要約になるだけでよい。
 */
function toResult(row: Record<string, unknown>, entry: CatalogEntry): AggregateResult | undefined {
  const name = typeof row["name"] === "string" ? row["name"].trim() : "";
  if (name === "") return undefined;

  const address = typeof row["address"] === "string" ? row["address"].trim() : "";
  const note = typeof row["note"] === "string" ? row["note"].trim() : "";

  const parts = [
    address === "" ? undefined : `所在地は${address}。`,
    note === "" ? undefined : `${note.replace(/。$/, "")}。`,
    `${entry.provider}が${entry.title}として公開している${entry.rowCount}件のうちの1件。`,
  ].filter((part): part is string => part !== undefined);

  return { name, summary: parts.join("") };
}

/**
 * 実照会を1回試みる。
 *
 * 失敗の分類（Issue #119）:
 * - `failed` … (a) LLM やD1 のインフラ障害 / (b) 出力不正。**縮退する。記録はしない**
 *   （答えられなかったのではなく、答えを取りに行けなかった）
 * - `empty` … (c) SQL は通ったが0行。**正当な未回答として記録する**
 */
export async function aggregateViaTextToSql(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  deps: CoreDeps,
): Promise<TextToSqlOutcome> {
  try {
    return await attemptTextToSql(input, entry, deps);
  } catch (cause) {
    // `LlmClient` / `SqlExecutor` は「throw しない」という約束だが、**約束は強制ではない**。
    // 注入される実装は差し替え可能で、ここで例外が抜けると `app.onError` の 500 になり、
    // 設計した縮退（キーワード実装へ戻る）が働かないまま利用者にエラーが返る。
    // 縮退できる場所で 500 を出さない
    console.error("[text-to-sql] 想定外の例外が発生しました", { datasetId: entry.datasetId, cause });
    return { kind: "failed", cause: `想定外の例外: ${String(cause)}` };
  }
}

async function attemptTextToSql(
  input: AggregateDatasetInput,
  entry: CatalogEntry,
  deps: CoreDeps,
): Promise<TextToSqlOutcome> {
  let previousError: string | undefined;
  const facets = await readFacets(entry, deps);

  for (let attempt = 1; attempt <= MAX_SQL_ATTEMPTS; attempt++) {
    const completion = await deps.llm.complete({
      purpose: "sql_generate",
      system: SYSTEM_PROMPT,
      user: buildPrompt(input, entry, facets, previousError),
      maxTokens: SQL_MAX_TOKENS,
    });
    if (!completion.ok) {
      // インフラ障害はリトライしても同じなので、ここで打ち切って縮退する
      return { kind: "failed", cause: `LLM 呼び出しに失敗しました: ${String(completion.cause)}` };
    }

    const guarded = guardSelect(unwrap(completion.text));
    if (!guarded.ok) {
      previousError = guarded.reason;
      console.warn("[text-to-sql] 生成 SQL を拒否しました", {
        attempt,
        datasetId: input.datasetId,
        reason: guarded.reason,
      });
      continue;
    }

    const executed = await deps.sql.select(guarded.sql);
    if (!executed.ok) {
      previousError = `SQL の実行に失敗しました: ${String(executed.cause)}`;
      console.warn("[text-to-sql] 生成 SQL の実行に失敗しました", { attempt, sql: guarded.sql });
      continue;
    }

    // ── 2枚目の壁（意味）。生成 SQL の書き方では偽装できない ────────────────
    // 別データセットの行が混ざったまま返すと、出典として別のデータセットを名乗ることになる。
    // それは「出典が本物であるぶん誤りが見つけにくい」最悪の壊れ方である（絶対ルール #2）
    const foreign = executed.rows.find((row) => row["dataset_id"] !== entry.datasetId);
    if (foreign) {
      console.error("[text-to-sql] 指定外のデータセットの行が返りました", {
        datasetId: entry.datasetId,
        returned: foreign["dataset_id"],
        sql: guarded.sql,
      });
      return { kind: "failed", cause: "指定したデータセット以外の行が返りました" };
    }

    if (executed.rows.length === 0) {
      // (c) 障害ではない。「探したが無かった」という答えである
      return { kind: "empty", sql: guarded.sql };
    }

    const result = toResult(executed.rows[0]!, entry);
    if (!result) {
      previousError = `SELECT する列に ${REQUIRED_COLUMNS.join(" と ")} を含めてください`;
      console.warn("[text-to-sql] 返った行から応答を組み立てられませんでした", { attempt, sql: guarded.sql });
      continue;
    }

    if (attempt > 1) {
      // リトライ回数は無料枠の消費に直結する（プラン1本 = aggregate 4回 × 最大3回）。
      // ダッシュボードで気づく前に、ログで頻度が見えるようにしておく
      console.warn("[text-to-sql] リトライ後に成功しました", { attempt, datasetId: input.datasetId });
    }
    return {
      kind: "answered",
      result,
      query: `D1 実照会: ${guarded.sql}（${entry.retrievedAt} 取得のスナップショット・全${entry.rowCount}行）`,
    };
  }

  return { kind: "failed", cause: `${MAX_SQL_ATTEMPTS} 回試行しましたが有効な SQL を生成できませんでした` };
}
