import type {
  AggregateResult,
  DatasetCandidate,
  ProvenanceSource,
  Unanswered,
  UnansweredReason,
} from "../../../shared/core";
import { UNANSWERED_REASONS } from "../../../shared/core";
import { callCoreOperation, type CoreOperation } from "../../api/coreOperations";
import { MAX_STOP_COUNT } from "./constants";
import { INTEREST_LABELS } from "./labels";
import type { Stop, Trip } from "./types";

/**
 * 旅のプロフィールから、コア3操作の応答だけでルートを組み立てる（Issue #31）。
 *
 * `search_datasets` → `aggregate_dataset`（候補ごと） → `get_provenance` の順に `/api/*` を呼ぶ。
 * 呼ぶのは `/api/*`（JSON）のみで、React 側に MCP クライアントは実装しない（ADR-008）。
 *
 * ## この層が守ること
 *
 * - **出典の取れなかった内容は返さない**（CLAUDE.md 絶対ルール #2）。`get_provenance` が
 *   出典を返さなかった停留地は落とし、1件も残らなければ「回答あり」にしない
 * - **仮データへ戻さない。** 応答が無い・壊れているときに既定のルートを返す経路を持たない
 *   （[ACE-28-1](../../../docs/08-knowledge/playbook/architecture.md#ace-28-1)）
 * - **`unanswered`（正常）と障害（異常）を型で分ける。** 混ぜると、データが無いことが
 *   通信エラーとして表示され、欠損が可視化されなくなる（API.md §4）
 * - **応答の形を検証する。** `coreOperations.ts` は JSON として読めれば `ok` を返すだけなので、
 *   ここで検証しないと `undefined` がそのまま画面に出る
 */

/**
 * 1ルートに載せる停留地の上限。`STOP_COUNT_BY_PACE`（constants.ts）の最大値から導く。
 * ハードコードで別々に持つと、ペースの表示件数（例: packed）を増やしても
 * `search_datasets` の上限は変わらず、増やしたはずの件数がエラーも無く頭打ちになる。
 * 現状は4（API.md §3.1 の既定値と一致。フロントエンドが1ルートに3〜4停留地を想定しているため）。
 */
export const ROUTE_STOP_LIMIT = MAX_STOP_COUNT;

/** 停留地とその出典。出典なしの停留地を作れないよう、対で持つ。 */
export type SourcedStop = { stop: Stop; source: ProvenanceSource };

/**
 * 応答を受け取れなかった障害。`unanswered`（データが無い）とは別物として扱う。
 * 種別は `coreOperations.ts` の分類をそのまま持ち上げる（health.ts / Issue #14 と同じ方針）。
 */
export type PlanFailure = {
  kind: "input" | "network" | "http" | "parse";
  detail: string;
  status?: number;
};

export type PlanOutcome =
  | { kind: "plan"; query: string; stops: SourcedStop[]; gaps: Unanswered[] }
  | { kind: "unanswered"; reason: UnansweredReason; message: string }
  | { kind: "failure"; failure: PlanFailure };

export type BuildPlanOptions = { fetchImpl?: typeof fetch };

/**
 * 旅のプロフィールから検索クエリを組み立てる。
 *
 * 興味は**表示ラベル（日本語）**に変換する。バックエンドのマッチは日本語の部分一致なので、
 * ドメイン値（`"ramen"`）をそのまま繋ぐと1件も当たらない（API_REQUIREMENTS.md §1）。
 *
 * エリアの指定はプロフィール画面に入力欄が無いため送らない。代表エリア（上野・浅草）を
 * 狙うには「その他のご希望」に地名を書く経路しか無く、そこは質問文としてそのまま渡る。
 * 専用の入力欄は Issue #42。
 */
export function buildQuery(trip: Trip): string {
  const interests = trip.interests.map((tag) => INTEREST_LABELS[tag]);
  return [...interests, trip.notes.trim()].filter((part) => part !== "").join("、");
}

export async function buildPlan(trip: Trip, options: BuildPlanOptions = {}): Promise<PlanOutcome> {
  const query = buildQuery(trip);
  if (query === "") {
    // 呼び出し側（この画面）の入力不足であって、オープンデータの欠損ではない。
    // unanswered として返すと、未回答の集計（DOMAIN.md §7）に自分たちの入力不足が積み上がる
    return {
      kind: "failure",
      failure: { kind: "input", detail: "興味・関心を1つ以上選ぶか、ご希望を入力してください。" },
    };
  }

  const searched = await callAndRead("search_datasets", { query, limit: ROUTE_STOP_LIMIT }, readCandidates, options);
  if (searched.kind !== "answered") return searched.outcome;

  const extracted: { datasetId: string; result: AggregateResult }[] = [];
  for (const candidate of searched.value.candidates) {
    const aggregated = await callAndRead(
      "aggregate_dataset",
      { datasetId: candidate.datasetId, intent: query },
      readAggregateResult,
      options,
    );
    // 障害はここで止める。1件が通信断なら残りも同じ結果になる
    if (aggregated.kind === "failure") return aggregated.outcome;
    // 抽出できなかった候補は落とす。その未回答はサーバー側で gaps に記録済み（Issue #27）
    if (aggregated.kind === "unanswered") continue;
    extracted.push({ datasetId: candidate.datasetId, result: aggregated.value });
  }

  if (extracted.length === 0) {
    // 候補は返ったが1件も中身を取り出せなかった。空のルートを「回答あり」として出さない
    return {
      kind: "unanswered",
      reason: "other",
      message: "該当するオープンデータがありません。候補のデータセットから、旅程に出せる地物を取り出せませんでした。",
    };
  }

  const sourced = await callAndRead(
    "get_provenance",
    { datasetIds: extracted.map((item) => item.datasetId), query },
    readSources,
    options,
  );
  if (sourced.kind !== "answered") return sourced.outcome;

  // 出典を datasetId で突き合わせる。突き合わない内容は落とす（出典なしのまま表示しない）
  const sourceByDatasetId = new Map(sourced.value.sources.map((source) => [source.datasetId, source]));
  const stops: SourcedStop[] = [];
  for (const { datasetId, result } of extracted) {
    const source = sourceByDatasetId.get(datasetId);
    if (!source) continue;
    // Stop.place ← name / Stop.note ← summary（2026-08-17 合意・API_REQUIREMENTS.md §2）。
    // マナーは出典を持つデータが無いので空。仮のマナー文を入れるのは出典なしの回答にあたる
    stops.push({ stop: { place: result.name, note: result.summary, etiquette: [] }, source });
  }

  if (stops.length === 0) {
    return {
      kind: "unanswered",
      reason: "other",
      message: "該当するオープンデータがありません。取り出した内容に対応する出典を取得できませんでした。",
    };
  }

  return { kind: "plan", query, stops, gaps: searched.value.gaps ?? [] };
}

// ---------------------------------------------------------------------------
// 呼び出しと応答の検証
// ---------------------------------------------------------------------------

/**
 * 1操作を呼び、応答の形まで確かめる。
 *
 * 形が仕様外だったときは `parse` の障害にする。`unanswered` に倒すと、サーバーが壊れた応答を
 * 返している事実が「データがありません」として画面に出てしまう。
 */
type ReadOutcome<T> =
  | { kind: "answered"; value: T }
  | { kind: "unanswered"; outcome: PlanOutcome }
  | { kind: "failure"; outcome: PlanOutcome };

async function callAndRead<T>(
  operation: CoreOperation,
  body: unknown,
  readAnswered: (body: Record<string, unknown>) => T | undefined,
  options: BuildPlanOptions,
): Promise<ReadOutcome<T>> {
  const result = await callCoreOperation(operation, body, { fetchImpl: options.fetchImpl });

  if (result.kind !== "ok") {
    const detail = result.kind === "http" ? describeHttp(result.status, result.body) : result.detail;
    return {
      kind: "failure",
      outcome: {
        kind: "failure",
        failure: {
          kind: result.kind,
          detail,
          status: result.kind === "http" || result.kind === "parse" ? result.status : undefined,
        },
      },
    };
  }

  if (!isRecord(result.body)) return { kind: "failure", outcome: malformed(operation, "オブジェクトではありません") };

  const unanswered = readUnanswered(result.body);
  if (unanswered) {
    return { kind: "unanswered", outcome: { kind: "unanswered", reason: unanswered.reason, message: unanswered.message } };
  }

  if (result.body.status !== "answered") {
    return { kind: "failure", outcome: malformed(operation, `status が不正です: ${String(result.body.status)}`) };
  }

  const value = readAnswered(result.body);
  if (value === undefined) return { kind: "failure", outcome: malformed(operation, "answered の中身が仕様と違います") };

  return { kind: "answered", value };
}

const malformed = (operation: CoreOperation, detail: string): PlanOutcome => ({
  kind: "failure",
  failure: { kind: "parse", detail: `${operation} の応答が仕様と違います（${detail}）` },
});

const describeHttp = (status: number, body: unknown): string => {
  const message = isRecord(body) && typeof body.message === "string" ? body.message : undefined;
  return message ? `HTTP ${status}: ${message}` : `HTTP ${status}`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** `unanswered` として読めるなら返す。`reason` は閉じた列挙のいずれかであること */
function readUnanswered(body: Record<string, unknown>): Unanswered | undefined {
  if (body.status !== "unanswered") return undefined;
  const { reason, message } = body;
  if (!isNonEmptyString(message)) return undefined;
  if (!(UNANSWERED_REASONS as readonly unknown[]).includes(reason)) return undefined;
  return { status: "unanswered", reason: reason as UnansweredReason, message };
}

/** 候補は `datasetId` しか使わないので、そこだけ確かめる */
function readCandidates(
  body: Record<string, unknown>,
): { candidates: Pick<DatasetCandidate, "datasetId">[]; gaps: Unanswered[] } | undefined {
  const { candidates } = body;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;

  const read: Pick<DatasetCandidate, "datasetId">[] = [];
  for (const candidate of candidates) {
    if (!isRecord(candidate) || !isNonEmptyString(candidate.datasetId)) return undefined;
    read.push({ datasetId: candidate.datasetId });
  }

  // gaps は optional。壊れていたら黙って捨てず、応答全体を仕様外として扱う（欠損の握りつぶし防止）
  const rawGaps = body.gaps;
  if (rawGaps === undefined) return { candidates: read, gaps: [] };
  if (!Array.isArray(rawGaps) || rawGaps.length === 0) return undefined;

  const gaps: Unanswered[] = [];
  for (const gap of rawGaps) {
    if (!isRecord(gap)) return undefined;
    const parsed = readUnanswered(gap);
    if (!parsed) return undefined;
    gaps.push(parsed);
  }
  return { candidates: read, gaps };
}

function readAggregateResult(body: Record<string, unknown>): AggregateResult | undefined {
  const { result } = body;
  if (!isRecord(result)) return undefined;
  if (!isNonEmptyString(result.name) || !isNonEmptyString(result.summary)) return undefined;
  return { name: result.name, summary: result.summary };
}

/**
 * 出典は**7フィールドすべて**を確かめる。1つでも欠けた出典を通すと、
 * 「出典つき」と見せながら中身の無いチップが出る（CLAUDE.md 絶対ルール #2）。
 * `license` はリテラルなので、カタログ外のデータが混ざれば弾かれる（同 #4）。
 */
function readSources(body: Record<string, unknown>): { sources: ProvenanceSource[] } | undefined {
  const { sources } = body;
  if (!Array.isArray(sources) || sources.length === 0) return undefined;

  const read: ProvenanceSource[] = [];
  for (const source of sources) {
    if (!isRecord(source)) return undefined;
    const { datasetId, datasetTitle, provider, license, url, query, retrievedAt } = source;
    if (
      !isNonEmptyString(datasetId) ||
      !isNonEmptyString(datasetTitle) ||
      !isNonEmptyString(provider) ||
      !isNonEmptyString(url) ||
      !isNonEmptyString(query) ||
      !isNonEmptyString(retrievedAt) ||
      license !== "CC BY 4.0"
    ) {
      return undefined;
    }
    read.push({ datasetId, datasetTitle, provider, license, url, query, retrievedAt });
  }
  return { sources: read };
}
