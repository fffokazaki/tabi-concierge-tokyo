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
 */

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

const invalid = (message: string): ParseResult<never> => ({ ok: false, message });

const asRecord = (body: unknown): Record<string, unknown> | undefined =>
  typeof body === "object" && body !== null && !Array.isArray(body) ? (body as Record<string, unknown>) : undefined;

/** 必須の文字列。空文字・空白のみは「指定なし」と同じなので通さない。 */
const readRequiredString = (record: Record<string, unknown>, key: string): ParseResult<string> => {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    return invalid(`"${key}" は空でない文字列で指定してください`);
  }
  return { ok: true, value };
};

/** 任意の文字列。未指定（undefined / null）は許すが、型違いは弾く。 */
const readOptionalString = (record: Record<string, unknown>, key: string): ParseResult<string | undefined> => {
  const value = record[key];
  if (value === undefined || value === null) return { ok: true, value: undefined };
  if (typeof value !== "string") return invalid(`"${key}" は文字列で指定してください`);
  return { ok: true, value };
};

export function parseSearchDatasetsInput(body: unknown): ParseResult<SearchDatasetsInput> {
  const record = asRecord(body);
  if (!record) return invalid("リクエストボディは JSON オブジェクトで送ってください");

  const query = readRequiredString(record, "query");
  if (!query.ok) return query;

  const area = readOptionalString(record, "area");
  if (!area.ok) return area;

  const category = readOptionalString(record, "category");
  if (!category.ok) return category;

  const rawLimit = record["limit"];
  let limit: number | undefined;
  if (rawLimit !== undefined && rawLimit !== null) {
    if (typeof rawLimit !== "number" || !Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_SEARCH_LIMIT) {
      return invalid(`"limit" は 1〜${MAX_SEARCH_LIMIT} の整数で指定してください`);
    }
    limit = rawLimit;
  }

  return { ok: true, value: { query: query.value, area: area.value, category: category.value, limit } };
}

export function parseAggregateDatasetInput(body: unknown): ParseResult<AggregateDatasetInput> {
  const record = asRecord(body);
  if (!record) return invalid("リクエストボディは JSON オブジェクトで送ってください");

  const datasetId = readRequiredString(record, "datasetId");
  if (!datasetId.ok) return datasetId;

  const intent = readRequiredString(record, "intent");
  if (!intent.ok) return intent;

  return { ok: true, value: { datasetId: datasetId.value, intent: intent.value } };
}

export function parseGetProvenanceInput(body: unknown): ParseResult<GetProvenanceInput> {
  const record = asRecord(body);
  if (!record) return invalid("リクエストボディは JSON オブジェクトで送ってください");

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

  return { ok: true, value: { datasetIds: rawIds, query: query.value } };
}
