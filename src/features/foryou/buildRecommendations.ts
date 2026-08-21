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
 * ADR-011 の構造化入力 `interests: string[]` をそのまま使う。あなたへはチップで1興味ずつ
 * （または「すべて」で複数まとめて）問い合わせる UI なので、自然文への畳み込みが引き起こす
 * 「キーワードが1件当たると他の興味の欠損が沈黙する」問題（Issue #53）を最初から踏まない
 * （プラン画面も同 Issue で構造化送信へ切り替え済み — `buildSearchInput`）。
 *
 * `gaps` は `search_datasets` が返したものだけではない。`aggregate_dataset` が候補ごとに
 * 返した未回答も同じ配列へ合流させる（Issue #89）。Issue #84 でバックエンドが「その興味の
 * 唯一の一致先だから」という理由で候補を能動的に枠へ押し込むようになったため、押し込んだ
 * 候補を集計できないと、検索側は「覆えた」と判定して欠損を出さず、集計側で黙って落ちる
 * ―― その興味が答えられも報告もされない状態になる。
 *
 * **未回答は分類（`reason`）と内訳（`gaps`）を分けて運ぶ。** 候補が全滅したときも分類は
 * 汎用の `other` に置いたまま、個々の理由を `gaps` として画面へ出す（[Issue #94] の決定。
 * 引き上げると1件のデータセットについての判定を全体の判定として名乗ることになる）。
 * **出典が突き合わない候補は `gaps` ではなく `parse` の障害にする**（[Issue #92]）。API.md §3.3 の
 * 契約により、`answered` が返ったなら要求した datasetId すべてに出典が付く。付いていないのは
 * バックエンドの不整合であって未公開データではないので、データ欠損の記録には混ぜない
 * （`missingProvenanceFailure` の doc 参照）。黙って落とさない点は変わらない ―― 画面には障害として出る。
 *
 * [Issue #92]: https://github.com/fffokazaki/tabi-concierge-tokyo/issues/92
 * [Issue #94]: https://github.com/fffokazaki/tabi-concierge-tokyo/issues/94
 */

export type RecommendationOutcome =
  | { kind: "recommendations"; recommendations: Recommendation[]; gaps: Unanswered[] }
  // `gaps` は**必須**。省略可にすると、内訳を運べる場所で黙って落とす経路が型として許される
  // （Issue #92・#94 が直したのはまさにそれ）。運ぶものが無いときは呼び出し側が空配列を明示する
  | { kind: "unanswered"; reason: UnansweredReason; message: string; gaps: Unanswered[] }
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

  // 候補ごとの集計は互いに独立（前の結果を使わない）ので、**全件を先に投げてから候補順に
  // 待つ**（Issue #142。プラン画面と同型 ―― `buildPlan.ts` と対で直す）。1件ずつ投げて待つと、
  // 1回あたり約1.1秒（ほぼ全部が推論の待ち時間）が候補数ぶん積み上がる。「すべて」は候補が
  // `RECOMMENDATION_LIMIT` 件まで出るので、プラン画面（4件）より積み上がりは大きい。
  //
  // `Promise.all` ではなく候補順に個別に待つ理由と、打ち切った promise を捨ててよい理由は
  // `buildPlan.ts` の同じ箇所に書いてある（対で読むこと）
  const pendingAggregates = searched.value.candidates.map((candidate) => ({
    datasetId: candidate.datasetId,
    pending: callAndRead(
      "aggregate_dataset",
      { datasetId: candidate.datasetId, intent: interests.join("、") },
      readAggregateResult,
      options,
    ),
  }));

  const extracted: { datasetId: string; result: AggregateResult }[] = [];
  // 集計できなかった候補の理由。黙って落とすと「最初から候補が無かった」ように見える
  // （Issue #89）ため、search_datasets の gaps と同じ経路で画面に出す
  const aggregateGaps: Unanswered[] = [];
  for (const { datasetId, pending } of pendingAggregates) {
    const outcome = await pending;
    // 障害は候補順で最初のものを採って打ち切る（直列だったときと同じ結果。到着順にすると、
    // 同じ入力でも実行のたびに違う障害が画面に出る）
    if (outcome.kind === "failure") return outcome.outcome;
    if (outcome.kind === "unanswered") {
      aggregateGaps.push(outcome.unanswered);
      continue;
    }
    extracted.push({ datasetId, result: outcome.value });
  }

  if (extracted.length === 0) {
    // 候補が全滅したときも分類は汎用の other に置く（Issue #94 の決定）。個々の未回答理由を
    // 画面全体の分類へ引き上げると、1件のデータセットについての判定を全体の判定として
    // 名乗ることになる ―― `data_not_published` は「カタログに該当データが存在しないことを
    // 確かめられた場合」（shared/core.ts）だが、実際に確かめたのは候補1件の不足でしかない。
    // **内訳は分類ではなく `gaps` で運ぶ**（DataGapCard が理由ごとに列挙する）。
    // 文面から「該当するオープンデータがありません。」を落としてあるのは、画面側が同じ一文を
    // 見出しとして出すため（重複の全体像は Issue #107）
    return {
      kind: "unanswered",
      reason: "other",
      message: "候補のデータセットから、おすすめに出せる地物を取り出せませんでした。",
      gaps: dedupeGaps([...(searched.value.gaps ?? []), ...aggregateGaps]),
    };
  }

  const sourced = await callAndRead(
    "get_provenance",
    { datasetIds: extracted.map((item) => item.datasetId), query: interests.join("、") },
    readSources,
    options,
  );
  if (sourced.kind === "failure") return sourced.outcome;
  if (sourced.kind === "unanswered") {
    // 出典が取れないので回答は作れない。ただし**それまでに集めた内訳は捨てない**
    // （Issue #92・#94。`callAndRead` が作る outcome は `gaps: []` なので、そのまま
    // 返すと検索側・集計側の欠損が消える ―― この PR が直している握りつぶしそのもの）
    return {
      kind: "unanswered",
      reason: sourced.unanswered.reason,
      message: sourced.unanswered.message,
      gaps: dedupeGaps([...(searched.value.gaps ?? []), ...aggregateGaps]),
    };
  }

  const sourceByDatasetId = new Map(sourced.value.sources.map((source) => [source.datasetId, source]));
  const recommendations: Recommendation[] = [];
  for (const { datasetId, result } of extracted) {
    const source = sourceByDatasetId.get(datasetId);
    // 出典が欠けるのは**データ欠損ではなく仕様違反**（Issue #92）。API.md §3.3 の契約により、
    // 知らない datasetId が1件でも混ざれば応答全体が `unanswered` になるので、`answered` なら
    // 要求した ID すべてに出典が付く。欠けているのはバックエンドの不整合なので、`gaps`
    // （＝公開されていないデータの記録）に混ぜず parse の障害として出す。混ぜると、実装のバグを
    // 「このデータは公開されていない」と偽って主張することになる（絶対ルール #1）
    if (!source) return missingProvenanceFailure(result.name, datasetId);
    recommendations.push({ name: result.name, blurb: result.summary, reason, source });
  }

  // 上のループは全件 push か return するので到達しない。残しているのは、将来 `continue` を
  // 戻した人が「出典なしの回答」を作れないようにするため（絶対ルール #2 の防波堤）
  if (recommendations.length === 0) return missingProvenanceFailure();

  return {
    kind: "recommendations",
    recommendations,
    gaps: dedupeGaps([...(searched.value.gaps ?? []), ...aggregateGaps]),
  };
}

/**
 * 出典の突き合わせが成立しなかったときの障害（Issue #92）。
 *
 * **データ欠損（`gaps`）ではなく `parse` の障害にする。** [API.md](../../../docs/02-design/API.md) §3.3 の
 * 契約は「知らない `datasetId` が1件でも混ざったら、既知のぶんだけ返さず全体を `unanswered` に
 * する」なので、`answered` が返ったなら要求した ID すべてに出典が付く。付いていないのは
 * バックエンドの不整合であって「そのデータが公開されていない」ではない。`gaps` に混ぜると
 * 実装のバグを未公開データとして主張することになり（絶対ルール #1）、DOMAIN.md §7 の
 * 未回答の集計も汚れる。
 *
 * 落とすこと自体は絶対ルール #2 どおりだが、**黙って落とさない** ―― 画面には障害として出る。
 */
const missingProvenanceFailure = (name?: string, datasetId?: string): RecommendationOutcome =>
  malformed(
    "get_provenance",
    name && datasetId
      ? `要求した datasetId の出典が返りませんでした（「${name}」・${datasetId}）`
      : "出典と突き合わせられた候補が1件もありません",
  );

/**
 * 同じ分類・同じ文面の未回答を1件にまとめる。
 *
 * 畳み込む単位は `DataGapCard` が行の区別に使う組（`reason` と `message`）と同じ。
 * そこを揃えないと React の key が重複する。
 *
 * **どれだけ実際に畳み込まれるかは当てにしない。** `computeAggregateDataset`
 * （worker/core/operations.ts）が返す未回答は6分岐のうち5つがデータセット名または ID を
 * 文面へ埋め込むため、同じ分類でも文面は候補ごとに異なる。ここは重複を防ぐ不変条件であって、
 * 件数を減らす仕組みではない。
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
      // 内訳は空。サーバーが `unanswered` に添える構造化欠損（Issue #70）は
      // `unansweredExtras`（worker/core/operations.ts）が構造化入力 `areas` を要求するため、
      // `interests` と `limit` だけを送るこの画面の呼び出しでは1件も付かない。
      // **`areas` を送るようになったら、ここで落ちる**ので読み直すこと
      outcome: { kind: "unanswered", reason: unanswered.reason, message: unanswered.message, gaps: [] },
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
