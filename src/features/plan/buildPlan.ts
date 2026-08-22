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
 *
 * `gaps` は `search_datasets` が返したものだけではない。`aggregate_dataset` が候補ごとに
 * 返した未回答も同じ配列へ合流させる（Issue #95。あなたへ画面の Issue #89 と同型）。
 *
 * **未回答は分類（`reason`）と内訳（`gaps`）を分けて運ぶ。** 候補が全滅したときも分類は
 * 汎用の `other` に置いたまま、個々の理由を `gaps` として画面へ出す（[Issue #94] の決定。
 * 引き上げると1件のデータセットについての判定を全体の判定として名乗ることになる）。
 * `PlanOutcome` の `unanswered` は `gaps` を**必須**で持つので、内訳を運べる場所で黙って
 * 落とす経路は型として作れない。
 *
 * **出典が突き合わない内容は `gaps` ではなく `parse` の障害にする**（[Issue #92]）。API.md §3.3 の
 * 契約により、`answered` が返ったなら要求した datasetId すべてに出典が付く。付いていないのは
 * バックエンドの不整合であって未公開データではないので、データ欠損の記録には混ぜない
 * （`missingProvenanceFailure` の doc 参照）。黙って落とさない点は変わらない ―― 画面には障害として出る。
 *
 * 上記2つはあなたへ画面と共通の設計判断で、Issue はあなたへ側で立っている（同型の実装は
 * `buildRecommendations.ts` にある。片方だけ直すと ACE-98-1 の言う対の崩れになる）。
 *
 * [Issue #92]: https://github.com/fffokazaki/tabi-concierge-tokyo/issues/92
 * [Issue #94]: https://github.com/fffokazaki/tabi-concierge-tokyo/issues/94
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
  kind: "input" | "network" | "http" | "parse" | "timeout";
  detail: string;
  status?: number;
};

export type PlanOutcome =
  | { kind: "plan"; query: string; stops: SourcedStop[]; gaps: Unanswered[] }
  // `gaps` は**必須**（`buildRecommendations.ts` と対）。省略可にすると、内訳を運べる場所で
  // 黙って落とす経路が型として許される。運ぶものが無いときは呼び出し側が空配列を明示する
  | { kind: "unanswered"; reason: UnansweredReason; message: string; gaps: Unanswered[] }
  | { kind: "failure"; failure: PlanFailure };

/** `timeoutMs` はテストが `coreOperations.ts` の既定タイムアウト（実時間）を待たずに
 *  タイムアウト経路を検証するための注入口（Issue #146）。本番は既定値のまま使う。 */
export type BuildPlanOptions = { fetchImpl?: typeof fetch; timeoutMs?: number };

/**
 * 旅のプロフィールから、意図・根拠の再現に使う全文を組み立てる。
 *
 * **`search_datasets` には使わない。** 興味を「、」で畳み込んだ自然文を検索に送ると、
 * キーワードが1件でも当たった時点で `answered` になり、答えていない興味が応答のどこにも
 * 残らない（Issue #53。「ナイトライフ、上野で夜遊びしたい」は銭湯の「夜」が「夜遊び」に
 * 部分一致する）。検索は `buildSearchInput` の構造化入力で送り、この全文は
 * `aggregate_dataset` の `intent`・`get_provenance` の `query`（出典に写る「何を訊いたか」）・
 * 画面表示（`PlanOutcome.query`）にだけ使う。
 *
 * 興味は**表示ラベル（日本語）**に変換する。バックエンドのマッチは日本語の部分一致なので、
 * ドメイン値（`"ramen"`）をそのまま繋ぐと1件も当たらない（API_REQUIREMENTS.md §1）。
 */
export function buildQuery(trip: Trip): string {
  const interests = trip.interests.map((tag) => INTEREST_LABELS[tag]);
  return [...interests, trip.notes.trim()].filter((part) => part !== "").join("、");
}

/**
 * `search_datasets` へ送る構造化入力（Issue #53／ADR-011）。
 *
 * 興味は畳み込む前の配列（`interests`）で、自由文は `query` で、**分けて**送る。
 * バックエンドは返した候補が覆っていない興味を1件ずつ `gaps` に載せるが、その判定は
 * `interests` を送った呼び出しでしか働かない（API.md §3.1「部分欠損」）。
 *
 * 空の値は**キーごと省く**。境界（`worker/core/parse.ts`）が空文字の `query` を 400 で
 * 弾くのは `interests` が無い呼び出しだけで、`interests` がある呼び出しでは空文字も
 * 省略と同義に受理される（parse が `""` へ正規化する）。つまりこの関数が作る形では
 * 境界は防波堤にならず、**キーごと省くこの実装だけが「空でも送ってよい」という
 * 誤読を防ぐ**。空配列の `interests` も「送らない」と同じ扱いだが、同じ理由で揃えて省く。
 *
 * エリアの指定はプロフィール画面に入力欄が無いため送らない（`areas` は使わない）。
 * 代表エリア（上野・浅草）を狙うには「その他のご希望」に地名を書く経路しか無く、
 * そこは `query` としてそのまま渡る。専用の入力欄は Issue #42。
 */
export function buildSearchInput(trip: Trip): { query?: string; interests?: string[]; limit: number } {
  const notes = trip.notes.trim();
  const interests = trip.interests.map((tag) => INTEREST_LABELS[tag]);
  return {
    ...(notes !== "" ? { query: notes } : {}),
    ...(interests.length > 0 ? { interests } : {}),
    limit: ROUTE_STOP_LIMIT,
  };
}

export async function buildPlan(trip: Trip, options: BuildPlanOptions = {}): Promise<PlanOutcome> {
  const query = buildQuery(trip);
  const searchInput = buildSearchInput(trip);
  // ガードは表示用の全文（buildQuery）ではなく**実際に送る値**を見る。全文で判定すると、
  // 将来 buildQuery に要素が足されたとき「全文は非空なのに検索には何も送らない」ずれが
  // 黙って入る（ROUTE_STOP_LIMIT を MAX_STOP_COUNT から導出しているのと同じ考え方）
  if (searchInput.query === undefined && searchInput.interests === undefined) {
    // 呼び出し側（この画面）の入力不足であって、オープンデータの欠損ではない。
    // unanswered として返すと、未回答の集計（DOMAIN.md §7）に自分たちの入力不足が積み上がる
    return {
      kind: "failure",
      failure: { kind: "input", detail: "興味・関心を1つ以上選ぶか、ご希望を入力してください。" },
    };
  }

  const searched = await callAndRead("search_datasets", searchInput, readCandidates, options);
  if (searched.kind !== "answered") return searched.outcome;

  // 候補ごとの集計は互いに独立（前の結果を使わない）ので、**全件を先に投げてから候補順に
  // 待つ**（Issue #142）。1件ずつ投げて待つと、1回あたり約1.1秒（ほぼ全部が推論の待ち時間）が
  // 候補数ぶん積み上がり、旅程が出るまで5〜6秒かかっていた。
  //
  // `map` の時点で全件のリクエストが出ている（`callAndRead` は最初の `await` まで同期に
  // 進むため）。`Promise.all` ではなく候補順に個別に待つのは、**候補順で最初の障害が
  // 確定した時点で、残りの応答を待たずに返せる**ようにするため。順序も同時に保たれる ――
  // 到着順に積むと、停留地の並びと gaps の順序が実行のたびに変わる
  const pendingAggregates = searched.value.candidates.map((candidate) => ({
    datasetId: candidate.datasetId,
    pending: callAndRead(
      "aggregate_dataset",
      { datasetId: candidate.datasetId, intent: query },
      readAggregateResult,
      options,
    ),
  }));

  const extracted: { datasetId: string; result: AggregateResult }[] = [];
  // 抽出できなかった候補の理由。黙って落とすと「最初から候補が無かった」ように見える
  // （Issue #95・#89 のプラン版）ため、search_datasets の gaps と同じ経路で画面に出す。
  // サーバー側の記録（Issue #27）に残ることは、画面に出さない理由にならない（DOMAIN.md §7）
  const aggregateGaps: Unanswered[] = [];
  for (const { datasetId, pending } of pendingAggregates) {
    const outcome = await pending;
    // 障害は候補順で最初のものを採って打ち切る（直列だったときと同じ結果。到着順にすると、
    // 同じ入力でも実行のたびに違う障害が画面に出る）。**呼び出し自体は打ち切れない** ――
    // 判定より前に全件を投げているので、直列なら省けていた後続の集計もサーバーへは届く
    // （1プラン ≒ 20.7 ニューロン／無料枠 10,000 のため許容と判断。Issue #142）。
    // 打ち切った後の応答は捨てるだけ ―― `callAndRead` は通常経路で reject しないので
    // （失敗はすべて分類して**返す**。唯一の抜けは `fetchImpl` が Response 以外を解決した
    // ときで、実 fetch では起きない）、捨てられた promise が未処理の reject にはならない
    if (outcome.kind === "failure") return outcome.outcome;
    if (outcome.kind === "unanswered") {
      aggregateGaps.push(outcome.unanswered);
      continue;
    }
    extracted.push({ datasetId, result: outcome.value });
  }

  if (extracted.length === 0) {
    // 候補は返ったが1件も中身を取り出せなかった。空のルートを「回答あり」として出さない。
    // 個々の未回答理由をここで画面全体の分類へ引き上げると、1件のデータセットについての判定を
    // 全体の判定として名乗ることになるため、分類は汎用の other に置く（Issue #94 の決定）。
    // **内訳は分類ではなく `gaps` で運ぶ**（DataGapCard が理由ごとに列挙する）。
    // 文面から「該当するオープンデータがありません。」を落としてあるのは、画面側が同じ一文を
    // 見出しとして出すため（重複の全体像は Issue #107）
    return {
      kind: "unanswered",
      reason: "other",
      message: "候補のデータセットから、旅程に出せる地物を取り出せませんでした。",
      gaps: dedupeGaps([...(searched.value.gaps ?? []), ...aggregateGaps]),
    };
  }

  const sourced = await callAndRead(
    "get_provenance",
    { datasetIds: extracted.map((item) => item.datasetId), query },
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

  // 出典を datasetId で突き合わせる。突き合わない内容は落とす（出典なしのまま表示しない）
  const sourceByDatasetId = new Map(sourced.value.sources.map((source) => [source.datasetId, source]));
  const stops: SourcedStop[] = [];
  for (const { datasetId, result } of extracted) {
    const source = sourceByDatasetId.get(datasetId);
    // 出典が欠けるのは**データ欠損ではなく仕様違反**（Issue #92）。API.md §3.3 の契約により、
    // 知らない datasetId が1件でも混ざれば応答全体が `unanswered` になるので、`answered` なら
    // 要求した ID すべてに出典が付く。欠けているのはバックエンドの不整合なので、`gaps`
    // （＝公開されていないデータの記録）に混ぜず parse の障害として出す。混ぜると、実装のバグを
    // 「このデータは公開されていない」と偽って主張することになる（絶対ルール #1）
    if (!source) return missingProvenanceFailure(result.name, datasetId);
    // Stop.place ← name / Stop.note ← summary（2026-08-17 合意・API_REQUIREMENTS.md §2）。
    // マナーは出典を持つデータが無いので空。仮のマナー文を入れるのは出典なしの回答にあたる
    stops.push({
      stop: { place: result.name, note: result.summary, category: result.category, etiquette: [] },
      source,
    });
  }

  // 上のループは全件 push か return するので到達しない。残しているのは、将来 `continue` を
  // 戻した人が「出典なしの回答」を作れないようにするため（絶対ルール #2 の防波堤）
  if (stops.length === 0) return missingProvenanceFailure();

  return {
    kind: "plan",
    query,
    stops,
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
const missingProvenanceFailure = (name?: string, datasetId?: string): PlanOutcome =>
  malformed(
    "get_provenance",
    name && datasetId
      ? `要求した datasetId の出典が返りませんでした（「${name}」・${datasetId}）`
      : "出典と突き合わせられた内容が1件もありません",
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
  // `outcome`（そのまま画面へ返す形）と `unanswered`（gaps へ積む形）の両方を持つ。
  // 呼び出し側が「打ち切る」か「記録して続ける」かを選べるようにするため（Issue #95）
  | { kind: "unanswered"; outcome: PlanOutcome; unanswered: Unanswered }
  | { kind: "failure"; outcome: PlanOutcome };

async function callAndRead<T>(
  operation: CoreOperation,
  body: unknown,
  readAnswered: (body: Record<string, unknown>) => T | undefined,
  options: BuildPlanOptions,
): Promise<ReadOutcome<T>> {
  const result = await callCoreOperation(operation, body, {
    fetchImpl: options.fetchImpl,
    timeoutMs: options.timeoutMs,
  });

  if (result.kind !== "ok") {
    const detail =
      result.kind === "http"
        ? describeHttp(result.status, result.body)
        : result.kind === "timeout"
          ? `${result.timeoutMs}ms 以内に応答がありませんでした`
          : result.detail;
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
      // 内訳は空。サーバーが `unanswered` に添える構造化欠損（Issue #70）は構造化入力 `areas` を
      // 要求する（worker/core/operations.ts の `unansweredExtras`）。プラン画面は `interests` は
      // 送るが（Issue #53）、興味の取り落ちは `unanswered` 側には載らない（未回答が「何も
      // 答えていない」を全体として覆っている — API.md §3.1）。`areas` は送らないため1件も
      // 付かない。**`areas` を送るようになったら読み直すこと**
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
  if (
    !isNonEmptyString(result.name) ||
    !isNonEmptyString(result.summary) ||
    !isNonEmptyString(result.category)
  ) {
    return undefined;
  }
  return { name: result.name, summary: result.summary, category: result.category };
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
