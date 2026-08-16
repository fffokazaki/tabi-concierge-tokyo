import type {
  AggregateDatasetInput,
  AggregateDatasetOutput,
  GetProvenanceInput,
  GetProvenanceOutput,
  RepresentativeArea,
  SearchDatasetsInput,
  SearchDatasetsOutput,
  Unanswered,
  UnansweredReason,
} from "../../shared/core";
import { REPRESENTATIVE_AREAS } from "../../shared/core";
import { CATALOG, findEntry, type CatalogEntry, type CatalogSample } from "./catalog";

/**
 * コア3操作のスタブ実装（Issue #22）。
 *
 * `/api/*`（[API.md](../../docs/02-design/API.md)）と、後から足す `/mcp` の**両方がここを呼ぶ**。
 * ルート側にロジックを書かない（ADR-008）。
 *
 * 中身は D1 を引かず、`catalog.ts` の固定データだけで答える。Step 5 で
 * メタデータRAG / Text-to-SQL に差し替える予定で、そのとき入出力の形は変えない。
 *
 * スタブでも守ること:
 * - 返す出典は実在のカタログデータセット。固定の集計結果も原本CSVに実在する行だけを使う
 * - 答えられないものは HTTP エラーではなく `unanswered` ＋ 理由分類で返す（API.md §4）
 */

/** 候補件数の既定値。フロントエンドが1ルートに3〜4停留地を想定している（API_REQUIREMENTS.md §1） */
export const DEFAULT_SEARCH_LIMIT = 4;
/** 候補件数の上限。利用データセットが10件しかないため、それ以上は意味を持たない */
export const MAX_SEARCH_LIMIT = 10;

/**
 * 「ジャンル指定の飲食店」を表す語。
 *
 * 飲食の店舗データは No.8（バリアフリー情報・210件）しかなく、**ジャンルの列を持たない**
 * （22列を実測。DATABASE.md「既知のデータ欠損」）。したがってジャンル単位の問いは
 * 「データ未公開」ではなく「粒度不足」として返す。代表シナリオ「ラーメンが好き」が
 * まさにこれに当たる。
 */
const CUISINE_GENRE_TERMS = [
  "ラーメン",
  "らーめん",
  "ramen",
  "寿司",
  "すし",
  "鮨",
  "焼肉",
  "そば",
  "蕎麦",
  "うどん",
  "天ぷら",
  "居酒屋",
  "カフェ",
];

/**
 * 代表エリア外と判定する地名。網羅ではなく、`area` を明示せず地名だけを書いた質問を
 * `out_of_area` に倒すためのスタブの簡易判定。Step 5 では住所・座標から判定する。
 */
const NON_TARGET_AREAS = ["新宿", "池袋", "銀座", "秋葉原", "お台場", "六本木", "吉祥寺", "品川"];

const includesAny = (haystack: string, needles: readonly string[]): string | undefined =>
  needles.find((needle) => haystack.includes(needle));

const unanswered = (reason: UnansweredReason, message: string): Unanswered => ({
  status: "unanswered",
  reason,
  message,
});

const isRepresentativeArea = (value: string): value is RepresentativeArea =>
  (REPRESENTATIVE_AREAS as readonly string[]).includes(value);

type ResolvedArea =
  | { kind: "representative"; area: RepresentativeArea }
  | { kind: "out_of_area"; label: string }
  | { kind: "unspecified" };

/** `area` の明示指定を優先し、無ければ質問文から代表エリア名／対象外の地名を拾う。 */
function resolveArea(input: SearchDatasetsInput): ResolvedArea {
  const explicit = input.area?.trim();
  if (explicit) {
    return isRepresentativeArea(explicit)
      ? { kind: "representative", area: explicit }
      : { kind: "out_of_area", label: explicit };
  }

  const fromQuery = REPRESENTATIVE_AREAS.find((area) => input.query.includes(area));
  if (fromQuery) return { kind: "representative", area: fromQuery };

  const nonTarget = includesAny(input.query, NON_TARGET_AREAS);
  return nonTarget ? { kind: "out_of_area", label: nonTarget } : { kind: "unspecified" };
}

/** 質問文に現れたキーワードの数。多く当たったデータセットほど候補として上に出す。 */
const scoreEntry = (entry: CatalogEntry, haystack: string): number =>
  entry.keywords.filter((keyword) => haystack.includes(keyword)).length +
  (haystack.includes(entry.title) ? 1 : 0);

const toCandidate = (entry: CatalogEntry) => ({
  datasetId: entry.datasetId,
  title: entry.title,
  provider: entry.provider,
  url: entry.url,
  matchReason: entry.matchReason,
});

/**
 * データセット検索。
 *
 * 判定の順番に意味がある。エリア外を先に弾き、次に「ジャンル指定の飲食」を粒度不足として
 * 分けてから、最後にエリアだけの絞り込みへ落とす。順番を変えると、答えられない問い
 * （ラーメン）に対してエリアのデータセット一覧を返してしまい、欠損が見えなくなる。
 *
 * 既知の制限（スタブ）: 答えられる興味と答えられない興味を1つの質問文に混ぜた場合
 * （例「上野の美術館とラーメン」）は、答えられる候補を返す。欠損を確実に見せたい場合は
 * 興味ごとに呼ぶこと。
 */
export function searchDatasets(input: SearchDatasetsInput): SearchDatasetsOutput {
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const haystack = [input.query, input.area ?? "", input.category ?? ""].join(" ");

  const area = resolveArea(input);
  if (area.kind === "out_of_area") {
    return unanswered(
      "out_of_area",
      `該当するオープンデータがありません。「${area.label}」は POC の対象エリア（${REPRESENTATIVE_AREAS.join("・")}）の外です。`,
    );
  }

  const inArea = CATALOG.filter((entry) => area.kind === "unspecified" || entry.areas.includes(area.area));
  const matched = inArea
    .map((entry) => ({ entry, score: scoreEntry(entry, haystack) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.no - b.entry.no)
    .map((scored) => scored.entry);

  if (matched.length > 0) {
    return { status: "answered", candidates: matched.slice(0, limit).map(toCandidate) };
  }

  const genre = includesAny(haystack, CUISINE_GENRE_TERMS);
  if (genre) {
    return unanswered(
      "insufficient_granularity",
      `該当するオープンデータがありません。飲食店の店舗データは「東京都内の飲食店のバリアフリー情報」（210件・バリアフリー対応店に限定）のみで、ジャンルの列を持たないため「${genre}」の粒度では答えられません。`,
    );
  }

  // キーワードが1つも当たらなくても、エリアが分かっていればそのエリアを収録した
  // データセットは事実として提示できる（「上野」だけの質問など）。
  if (area.kind === "representative" && inArea.length > 0) {
    return { status: "answered", candidates: inArea.slice(0, limit).map(toCandidate) };
  }

  return unanswered(
    "data_not_published",
    "該当するオープンデータがありません。利用中の10データセットに、この条件に対応するものがありません。",
  );
}

/**
 * 集計意図にエリア名が入っていればその行を、無ければ先頭の行を返す。
 * 集計表（`samples` が空）では返せる行が無いため undefined になる。
 */
const pickSample = (entry: CatalogEntry, intent: string): CatalogSample | undefined =>
  entry.samples.find((sample) => intent.includes(sample.area)) ?? entry.samples.at(0);

/**
 * 出典に添える「実行したクエリ」。
 *
 * スタブは SQL を実行していないので、SQL 風の文字列を返すと「実行した」という嘘になる。
 * 実際に行ったこと（どのスナップショットの何行目を固定で返したか）をそのまま書く。
 */
const describeQuery = (entry: CatalogEntry, sample: CatalogSample): string =>
  `固定データ抽出（スタブ）: data/${entry.datasetId}/data.csv（${entry.retrievedAt} 取得・全${entry.rowCount}行）の ${sample.sourceRow} 行目。Step 5 で Text-to-SQL に置き換える。`;

/** 集計・抽出。固定データから1件を返す。 */
export function aggregateDataset(input: AggregateDatasetInput): AggregateDatasetOutput {
  const entry = findEntry(input.datasetId);
  if (!entry) {
    return unanswered(
      "data_not_published",
      `該当するオープンデータがありません。データセットID「${input.datasetId}」は利用中の10件に含まれていません。`,
    );
  }

  const genre = includesAny(input.intent, CUISINE_GENRE_TERMS);
  if (genre && entry.datasetId === "t000012d0000000063") {
    return unanswered(
      "insufficient_granularity",
      `「${entry.title}」はジャンルの列を持たないため、「${genre}」の粒度では抽出できません。`,
    );
  }

  const sample = pickSample(entry, input.intent);
  if (!sample) {
    return unanswered(
      "insufficient_granularity",
      `「${entry.title}」は施設一覧ではなく集計表のため、個別の地物を抽出できません。`,
    );
  }

  return {
    status: "answered",
    result: { name: sample.name, summary: sample.summary },
    query: describeQuery(entry, sample),
  };
}

/**
 * 出典取得。
 *
 * 知らない ID が1つでも混じっていたら、既知のぶんだけ返すのではなく全体を `unanswered` にする。
 * 黙って落とすと、呼び出し側は「出典が揃った」と誤認したまま画面に出してしまう。
 */
export function getProvenance(input: GetProvenanceInput): GetProvenanceOutput {
  const resolved: CatalogEntry[] = [];
  const unknown: string[] = [];
  for (const id of input.datasetIds) {
    const entry = findEntry(id);
    if (entry) resolved.push(entry);
    else unknown.push(id);
  }

  if (unknown.length > 0) {
    return unanswered(
      "data_not_published",
      `出典を生成できません。データセットID ${unknown.join("・")} は利用中の10件に含まれていません。`,
    );
  }
  // 出典0件の「回答あり」は仕様違反（DOMAIN.md §8 不変条件1）。空配列を返さない
  if (resolved.length === 0) {
    return unanswered("other", "出典を生成できません。datasetIds が空です。");
  }

  const sources = resolved.map((entry) => ({
    datasetId: entry.datasetId,
    datasetTitle: entry.title,
    provider: entry.provider,
    license: entry.license,
    url: entry.url,
    query: input.query,
    retrievedAt: entry.retrievedAt,
  }));

  return { status: "answered", sources };
}
