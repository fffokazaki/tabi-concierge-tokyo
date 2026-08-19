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
 *
 * `gaps` は `search_datasets` が返したものだけではない。`aggregate_dataset` が候補ごとに
 * 返した未回答も同じ配列へ合流させる（Issue #89）。Issue #84 でバックエンドが「その興味の
 * 唯一の一致先だから」という理由で候補を能動的に枠へ押し込むようになったため、押し込んだ
 * 候補を集計できないと、検索側は「覆えた」と判定して欠損を出さず、集計側で黙って落ちる
 * ―― その興味が答えられも報告もされない状態になる。
 *
 * **出典が取れずに落ちる候補（`get_provenance` 側）はまだ黙って消える**（[Issue #92]）。
 * 集計側と違って持ち上げられる文面がサーバー応答に無く、何を出すかを決める必要があるため
 * 分けてある。
 *
 * [Issue #92]: https://github.com/fffokazaki/tabi-concierge-tokyo/issues/92
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
  // 集計できなかった候補の理由。黙って落とすと「最初から候補が無かった」ように見える
  // （Issue #89）ため、search_datasets の gaps と同じ経路で画面に出す
  const aggregateGaps: Unanswered[] = [];
  for (const candidate of searched.value.candidates) {
    const aggregated = await callAndRead(
      "aggregate_dataset",
      { datasetId: candidate.datasetId, intent: interests.join("、") },
      readAggregateResult,
      options,
    );
    if (aggregated.kind === "failure") return aggregated.outcome;
    if (aggregated.kind === "unanswered") {
      aggregateGaps.push(aggregated.unanswered);
      continue;
    }
    extracted.push({ datasetId: candidate.datasetId, result: aggregated.value });
  }

  if (extracted.length === 0) {
    // 理由が1つに定まるときはそれをそのまま返す。汎用の other へ丸めると、
    // 粒度不足（insufficient_granularity）が「その他」として集計され、
    // 未回答の分類そのものが実態とずれる（DOMAIN.md §7・§8）
    const only = dedupeGaps(aggregateGaps);
    if (only.length === 1) return { kind: "unanswered", reason: only[0].reason, message: only[0].message };

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

  return {
    kind: "recommendations",
    recommendations,
    gaps: dedupeGaps([...(searched.value.gaps ?? []), ...aggregateGaps]),
  };
}

/**
 * 同じ分類・同じ文面の未回答を1件にまとめる。
 *
 * 集計側の未回答は「どのデータセットで起きたか」を含まない文面なので、複数の候補が
 * 同じ理由で落ちると同一の行が並ぶ。畳み込む単位は `DataGapCard` が行の区別に使う組
 * （`reason` と `message`）と同じで、そこを揃えないと React の key が重複する。
 */
function dedupeGaps(gaps: Unanswered[]): Unanswered[] {
  const seen = new Set<string>();
  return gaps.filter((gap) => {
    const key = `${gap.reason}:${gap.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ---------------------------------------------------------------------------
// 呼び出しと応答の検証（buildPlan.ts と同じ方針。意図的な重複は冒頭コメント参照）
// ---------------------------------------------------------------------------

type ReadOutcome<T> =
  | { kind: "answered"; value: T }
  // `outcome`（そのまま画面へ返す形）と `unanswered`（gaps へ積む形）の両方を持つ。
  // 呼び出し側が「打ち切る」か「記録して続ける」かを選べるようにするため（Issue #89）
  | { kind: "unanswered"; outcome: RecommendationOutcome; unanswered: Unanswered }
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
    return {
      kind: "unanswered",
      outcome: { kind: "unanswered", reason: unanswered.reason, message: unanswered.message },
      unanswered,
    };
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
