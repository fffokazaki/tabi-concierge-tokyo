import type { AggregateDatasetInput, GetProvenanceInput, SearchDatasetsInput } from "../../shared/core";
import { MAX_SEARCH_LIMIT } from "./operations";

/**
 * リクエストボディ（`unknown`）をコア操作の入力型へ変換する。
 *
 * `/api/*` と `/mcp` の両方がここを通す。境界で形を検査しておかないと、
 * `undefined` がそのまま応答に混ざり「出典はあるが中身が空」という壊れ方をする。
 *
 * ここで弾くのは**入力の形の違反**だけ（HTTP 400）。「該当データが無い」は入力として
 * 正しいので弾かず、`operations.ts` が `unanswered` として返す（API.md §4）。
 *
 * 文字列は**トリムしてから返す**。境界で正規化しておかないと、`"t131067d0000000251\n"` のような
 * 転送時の書式ノイズがデータセットIDの不一致として扱われ、未回答の統計（DOMAIN.md §7）に
 * 「データが無い」として積み上がる。
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const invalid = (message: string): ParseResult<never> => ({ ok: false, message });

const NOT_AN_OBJECT = "リクエストボディは JSON オブジェクトで送ってください";

const asRecord = (body: unknown): Record<string, unknown> | undefined =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;

/** 必須の文字列。空文字・空白のみは「指定なし」と同じなので通さない。 */
const readRequiredString = (record: Record<string, unknown>, key: string): ParseResult<string> => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    return invalid(`"${key}" は空でない文字列で指定してください`);
  }
  return { ok: true, value: value.trim() };
};

/** 任意の文字列。未指定（undefined / null）は許すが、型違いは弾く。 */
const readOptionalString = (record: Record<string, unknown>, key: string): ParseResult<string | undefined> => {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return invalid(`"${key}" は文字列で指定してください`);
  return { ok: true, value: value.trim() };
};

/**
 * 任意の文字列配列。未指定（undefined / null）は許すが、型違い・空文字の要素は弾く。
 * 空配列は**通す**（`areas: []` は「目的地なし」の明示で、未指定とは意味が違う。API.md §3.1）。
 */
const readOptionalStringArray = (record: Record<string, unknown>, key: string): ParseResult<string[] | undefined> => {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (!Array.isArray(value) || !value.every((item): item is string => typeof item === "string" && item.trim() !== "")) {
    return invalid(`"${key}" は空でない文字列の配列で指定してください`);
  }
  return { ok: true, value: value.map((item) => item.trim()) };
};

/** 任意の整数。範囲外は黙って丸めず弾く（丸めると呼び出し側が指定の無効化に気づけない）。 */
const readOptionalBoundedInteger = (
  record: Record<string, unknown>,
  key: string,
  min: number,
  max: number,
): ParseResult<number | undefined> => {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    return invalid(`"${key}" は ${min}〜${max} の整数で指定してください`);
  }
  return { ok: true, value };
};

export function parseSearchDatasetsInput(body: unknown): ParseResult<SearchDatasetsInput> {
  const record = asRecord(body);
  if (!record) return invalid(NOT_AN_OBJECT);

  const interests = readOptionalStringArray(record, "interests");
  if (!interests.ok) return interests;

  // 興味を構造化して送る場合（ADR-011）、自由文は無いことがある（興味チップだけ選んで
  // 「その他のご希望」を書かない呼び出し）。それ以外では従来どおり必須
  const hasInterests = (interests.value?.length ?? 0) > 0;
  const query = hasInterests ? readOptionalString(record, "query") : readRequiredString(record, "query");
  if (!query.ok) return query;

  const area = readOptionalString(record, "area");
  if (!area.ok) return area;

  const areas = readOptionalStringArray(record, "areas");
  if (!areas.ok) return areas;

  // 片方は絞り込みの単数指定・片方は訊かれた目的地の列で、意味が重なる。両方送られたとき
  // どちらを信じるかを実装が黙って決めると、無視された側の指定に呼び出し側が気づけない
  if (area.value && areas.value !== undefined) {
    return invalid('"area" と "areas" は同時に指定できません（"areas" に一本化してください）');
  }

  const category = readOptionalString(record, "category");
  if (!category.ok) return category;

  const limit = readOptionalBoundedInteger(record, "limit", 1, MAX_SEARCH_LIMIT);
  if (!limit.ok) return limit;

  return {
    ok: true,
    value: {
      query: query.value ?? "",
      area: area.value,
      areas: areas.value,
      interests: interests.value,
      category: category.value,
      limit: limit.value,
    },
  };
}

export function parseAggregateDatasetInput(body: unknown): ParseResult<AggregateDatasetInput> {
  const record = asRecord(body);
  if (!record) return invalid(NOT_AN_OBJECT);

  const datasetId = readRequiredString(record, "datasetId");
  if (!datasetId.ok) return datasetId;

  const intent = readRequiredString(record, "intent");
  if (!intent.ok) return intent;

  return { ok: true, value: { datasetId: datasetId.value, intent: intent.value } };
}

export function parseGetProvenanceInput(body: unknown): ParseResult<GetProvenanceInput> {
  const record = asRecord(body);
  if (!record) return invalid(NOT_AN_OBJECT);

  const rawIds = record["datasetIds"];
  if (!Array.isArray(rawIds) || rawIds.length === 0) {
    return invalid('"datasetIds" は1件以上の配列で指定してください');
  }
  if (!rawIds.every((id): id is string => typeof id === "string" && id.trim() !== "")) {
    return invalid('"datasetIds" の要素は空でない文字列で指定してください');
  }

  // 実行クエリの不在を理由に出典を省略してはならない（API.md §4）ため、query は必須
  const query = readRequiredString(record, "query");
  if (!query.ok) return query;

  return { ok: true, value: { datasetIds: rawIds.map((id) => id.trim()), query: query.value } };
}
