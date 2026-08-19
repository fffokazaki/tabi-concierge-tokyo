import type {
  AggregateResult,
  DatasetCandidate,
  ProvenanceSource,
  Unanswered,
  UnansweredReason,
} from "../../../shared/core";
import { UNANSWERED_REASONS } from "../../../shared/core";
import { callCoreOperation, type CoreOperation } from "../../api/coreOperations";
import { FORYOU_INTEREST_TAGS, RECOMMENDATION_LIMIT } from "./constants";
import { RECOMMENDATION_REASON_LABELS } from "./labels";
import { INTEREST_LABELS } from "../plan/labels";
import type { ActiveInterest, Recommendation } from "./types";

/**
 * あなたへ画面のレコメンド組み立て（Issue #78 スコーピングの続き）。
 *
 * `buildPlan.ts` と対になる構成・検証方針をそのまま踏襲する（**意図的な重複**。
 * `usePlanState` と混ぜず `useForYouState` を独立させたのと同じ理由で、プランの
 * 十分にテスト済みの検証ロジックへ手を入れるリスクを避ける）。
 *
 * プランの `buildQuery`（自然文への畳み込み）とは違い、ADR-011 の構造化入力
 * `interests: string[]` をそのまま使う。あなたへはチップで1興味ずつ（または「すべて」で
 * 複数まとめて）問い合わせる UI なので、畳み込みが引き起こす「キーワードが1件当たると
 * 他の興味の欠損が沈黙する」問題（Issue #53）を最初から踏まない。
 */

export type RecommendationOutcome =
  | { kind: "recommendations"; recommendations: Recommendation[]; gaps: Unanswered[] }
  | { kind: "unanswered"; reason: UnansweredReason; message: string }
  | { kind: "failure"; failure: RecommendationFailure };

export type RecommendationFailure = {
  kind: "input" | "network" | "http" | "parse";
  detail: string;
  status?: number;
};

export type BuildRecommendationsOptions = { fetchImpl?: typeof fetch };

/** `activeInterest` から `search_datasets` へ渡す興味ラベルの配列を作る。 */
function interestLabelsFor(activeInterest: ActiveInterest): string[] {
  const tags = activeInterest === "all" ? FORYOU_INTEREST_TAGS : [activeInterest];
  return tags.map((tag) => INTEREST_LABELS[tag]);
}

export async function buildRecommendations(
  activeInterest: ActiveInterest,
  options: BuildRecommendationsOptions = {},
): Promise<RecommendationOutcome> {
  const interests = interestLabelsFor(activeInterest);

  const searched = await callAndRead(
    "search_datasets",
    { interests, limit: RECOMMENDATION_LIMIT },
    readCandidates,
    options,
  );
  if (searched.kind !== "answered") return searched.outcome;

  // 「すべて」でまとめて問い合わせたときは、1件の候補がどの興味に応えたものか応答から
  // 特定できない。単一チップのときだけ確信を持って理由タグを出す（Recommendation.reason 参照）
  const reason = activeInterest === "all" ? null : RECOMMENDATION_REASON_LABELS[activeInterest];

  const extracted: { datasetId: string; result: AggregateResult }[] = [];
  for (const candidate of searched.value.candidates) {
    const aggregated = await callAndRead(
      "aggregate_dataset",
      { datasetId: candidate.datasetId, intent: interests.join("、") },
      readAggregateResult,
      options,
    );
    if (aggregated.kind === "failure") return aggregated.outcome;
    if (aggregated.kind === "unanswered") continue;
    extracted.push({ datasetId: candidate.datasetId, result: aggregated.value });
  }

  if (extracted.length === 0) {
    return {
      kind: "unanswered",
      reason: "other",
      message: "該当するオープンデータがありません。候補のデータセットから、おすすめに出せる地物を取り出せませんでした。",
    };
  }

  const sourced = await callAndRead(
    "get_provenance",
    { datasetIds: extracted.map((item) => item.datasetId), query: interests.join("、") },
    readSources,
    options,
  );
  if (sourced.kind !== "answered") return sourced.outcome;

  const sourceByDatasetId = new Map(sourced.value.sources.map((source) => [source.datasetId, source]));
  const recommendations: Recommendation[] = [];
  for (const { datasetId, result } of extracted) {
    const source = sourceByDatasetId.get(datasetId);
    if (!source) continue;
    recommendations.push({ name: result.name, blurb: result.summary, reason, source });
  }

  if (recommendations.length === 0) {
    return {
      kind: "unanswered",
      reason: "other",
      message: "該当するオープンデータがありません。取り出した内容に対応する出典を取得できませんでした。",
    };
  }

  return { kind: "recommendations", recommendations, gaps: searched.value.gaps ?? [] };
}

// ---------------------------------------------------------------------------
// 呼び出しと応答の検証（buildPlan.ts と同じ方針。意図的な重複は冒頭コメント参照）
// ---------------------------------------------------------------------------

type ReadOutcome<T> =
  | { kind: "answered"; value: T }
  | { kind: "unanswered"; outcome: RecommendationOutcome }
  | { kind: "failure"; outcome: RecommendationOutcome };

async function callAndRead<T>(
  operation: CoreOperation,
  body: unknown,
  readAnswered: (body: Record<string, unknown>) => T | undefined,
  options: BuildRecommendationsOptions,
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

const malformed = (operation: CoreOperation, detail: string): RecommendationOutcome => ({
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

function readUnanswered(body: Record<string, unknown>): Unanswered | undefined {
  if (body.status !== "unanswered") return undefined;
  const { reason, message } = body;
  if (!isNonEmptyString(message)) return undefined;
  if (!(UNANSWERED_REASONS as readonly unknown[]).includes(reason)) return undefined;
  return { status: "unanswered", reason: reason as UnansweredReason, message };
}

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
