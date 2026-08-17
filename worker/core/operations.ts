import type {
  AggregateDatasetInput,
  AggregateDatasetOutput,
  DatasetCandidate,
  GetProvenanceInput,
  GetProvenanceOutput,
  NonEmpty,
  RepresentativeArea,
  SearchDatasetsInput,
  SearchDatasetsOutput,
  Unanswered,
  UnansweredReason,
} from "../../shared/core";
import { REPRESENTATIVE_AREAS } from "../../shared/core";
import { CATALOG, findEntry, RESTAURANT_DATASET_ID, type CatalogEntry, type CatalogSample } from "./catalog";

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
 * - **問われたものと違うものを返さない。** 「それらしい何か」を返すくらいなら答えない
 *
 * **`worker/core/` は境界（`parse.ts`）を通らずに直接呼ばれうる**（Step 5 の `/mcp`）。
 * 入力の検査を境界任せにせず、ここでも壊れた値で不正な応答を作らないようにする。
 */

/** 候補件数の既定値。フロントエンドが1ルートに3〜4停留地を想定している（API_REQUIREMENTS.md §1） */
export const DEFAULT_SEARCH_LIMIT = 4;
/** 候補件数の上限。利用データセットが10件しかないため、それ以上は意味を持たない */
export const MAX_SEARCH_LIMIT = 10;

/**
 * 「ジャンル指定の飲食」を表す語。
 *
 * 飲食の店舗データは No.8（バリアフリー情報・210件）しかなく、**ジャンルの列を持たない**
 * （22列を実測。DATABASE.md「既知のデータ欠損」）。したがってジャンル単位の問いは
 * 「データ未公開」ではなく「粒度不足」として返す。代表シナリオ「ラーメンが好き」がこれ。
 *
 * 日本語は分かち書きしないため、部分一致は語の境界を見ない。素の「そば」は「〜のそば（近く）」
 * に当たってしまい、「上野駅のそばの公園」を飲食の問いとして弾いてしまうので入れない。
 */
const CUISINE_GENRE_TERMS = [
  "ラーメン",
  "らーめん",
  "ramen",
  "寿司",
  "すし",
  "鮨",
  "焼肉",
  "蕎麦",
  "そば屋",
  "うどん",
  "天ぷら",
  "居酒屋",
  "カフェ",
];

/**
 * 代表エリア外と判定する地名。網羅ではなく、`area` を明示せず地名だけを書いた質問を
 * `out_of_area` に倒すためのスタブの簡易判定。Step 5 では住所・座標から判定する。
 *
 * `notWhen` は誤爆の除外。「銀座線」は浅草・上野を通る地下鉄なので、「銀座線で行けるお寺」を
 * 対象エリア外にしてはいけない（部分一致が語の境界を見ないことへの対処）。
 */
const NON_TARGET_AREAS: readonly { readonly name: string; readonly notWhen?: readonly string[] }[] = [
  { name: "新宿" },
  { name: "池袋" },
  { name: "銀座", notWhen: ["銀座線"] },
  { name: "秋葉原" },
  { name: "お台場" },
  { name: "六本木" },
  { name: "吉祥寺" },
  { name: "品川" },
];

/**
 * 渋谷で「観光・名所・文化施設」を訊かれた場合に、実測を根拠に `data_not_published` と言える語。
 *
 * 渋谷区のカタログ掲載データは17件で、観光ポイント・名所・文化施設に相当するものは
 * **1件も無い**（2026-08-16 調査・DATABASE.md「渋谷エリアの制約」）。利用中の10件に無いという
 * 話ではなく、カタログ側に無いことを確かめてあるので、最も強い分類を使ってよい数少ない場面。
 */
const SHIBUYA_SIGHTSEEING_TERMS = ["観光", "名所", "史跡", "寺", "神社", "美術館", "博物館", "文化施設"];

/** 最初に見つかった語を返す。どれも含まれなければ undefined */
const findFirstTerm = (haystack: string, needles: readonly string[]): string | undefined =>
  needles.find((needle) => haystack.includes(needle));

/** 対象エリア外の地名を返す。誤爆語（銀座線など）が一緒に現れる場合は判定しない */
const findNonTargetArea = (text: string): string | undefined =>
  NON_TARGET_AREAS.find(
    (area) => text.includes(area.name) && !area.notWhen?.some((exclusion) => text.includes(exclusion)),
  )?.name;

const unanswered = (reason: UnansweredReason, message: string): Unanswered => ({
  status: "unanswered",
  reason,
  message,
});

/**
 * 「答えられない」と実測で言い切れる既知の欠損。
 *
 * この3つは**応答全体の未回答としても、答えられた候補に添える部分欠損としても、同じ値を返す**
 * （Issue #29）。片方だけ文言を変えると、同じ欠損が呼び出し側で別物に見え、
 * 未回答の集計（DOMAIN.md §7）が分裂する。
 */

const cuisineGenreUnanswered = (genre: string): Unanswered =>
  unanswered(
    "insufficient_granularity",
    `該当するオープンデータがありません。飲食店の店舗データは「東京都内の飲食店のバリアフリー情報」（210件・バリアフリー対応店に限定）のみで、ジャンルの列を持たないため「${genre}」の粒度では答えられません。`,
  );

const outOfAreaUnanswered = (label: string): Unanswered =>
  unanswered(
    "out_of_area",
    `該当するオープンデータがありません。「${label}」は POC の対象エリア（${REPRESENTATIVE_AREAS.join("・")}）の外です。`,
  );

const shibuyaSightseeingUnanswered = (): Unanswered =>
  unanswered(
    "data_not_published",
    "該当するオープンデータがありません。渋谷区のカタログ掲載データは17件で、観光ポイント・名所・文化施設に相当するデータは公開されていません（2026-08-16 調査）。",
  );

const isRepresentativeArea = (value: string): value is RepresentativeArea =>
  (REPRESENTATIVE_AREAS as readonly string[]).includes(value);

/** 質問文に現れた代表エリア。複数あれば先に定義した順（上野→浅草→渋谷） */
const findRepresentativeArea = (text: string): RepresentativeArea | undefined =>
  REPRESENTATIVE_AREAS.find((area) => text.includes(area));

type ResolvedArea =
  | {
      kind: "representative";
      area: RepresentativeArea;
      /**
       * 代表エリアと**一緒に**質問文に現れた対象エリア外の地名（「上野と品川の寺」の品川）。
       * 代表エリアを優先して答えるが、対象外だった側を黙って捨てないために持ち回る（Issue #29）。
       */
      alsoOutOfArea?: string;
    }
  | { kind: "out_of_area"; label: string }
  | { kind: "unspecified" };

/**
 * `area` の明示指定を優先し、無ければ質問文から代表エリア名／対象外の地名を拾う。
 *
 * 質問文の中では代表エリアを対象外の地名より優先する（「新宿から上野へ行きたい」は答えられる）。
 * ただし優先しただけで対象外の地名が消えるわけではないので、`alsoOutOfArea` に残す。
 */
function resolveArea(input: SearchDatasetsInput): ResolvedArea {
  const explicit = input.area?.trim();
  if (explicit) {
    return isRepresentativeArea(explicit)
      ? { kind: "representative", area: explicit, alsoOutOfArea: findNonTargetArea(input.query) }
      : { kind: "out_of_area", label: explicit };
  }

  const fromQuery = findRepresentativeArea(input.query);
  if (fromQuery) {
    return { kind: "representative", area: fromQuery, alsoOutOfArea: findNonTargetArea(input.query) };
  }

  const nonTarget = findNonTargetArea(input.query);
  return nonTarget ? { kind: "out_of_area", label: nonTarget } : { kind: "unspecified" };
}

/** 質問文に現れたキーワードの数。多く当たったデータセットほど候補として上に出す。 */
const scoreEntry = (entry: CatalogEntry, haystack: string): number =>
  entry.keywords.filter((keyword) => haystack.includes(keyword)).length +
  (haystack.includes(entry.title) ? 1 : 0);

const toCandidate = (entry: CatalogEntry): DatasetCandidate => ({
  datasetId: entry.datasetId,
  title: entry.title,
  provider: entry.provider,
  url: entry.url,
  matchReason: entry.matchReason,
});

type AnsweredSearch = Extract<SearchDatasetsOutput, { status: "answered" }>;

/**
 * 候補が1件以上あるときだけ `answered` を作る。
 *
 * 戻り値の型が `NonEmpty` なので、空配列から「回答あり」を作ることが**型として不可能**になる
 * （DOMAIN.md §8 不変条件1）。以前は `limit: 0` で候補ゼロの `answered` が作れていた。
 */
function answeredCandidates(entries: readonly CatalogEntry[]): AnsweredSearch | undefined {
  const [first, ...rest] = entries;
  if (!first) return undefined;
  const candidates: NonEmpty<DatasetCandidate> = [toCandidate(first), ...rest.map(toCandidate)];
  return { status: "answered", candidates };
}

/**
 * 質問文に混ざっている「答えられない側面」を集める。
 *
 * ここに挙がるのは、既存の未回答判定がすでに列挙している3つ（ジャンル指定の飲食 /
 * 対象エリア外の地名 / 渋谷の観光データ未公開）だけ。**自然文を興味に分解することはしない。**
 * 分解の規則を今スタブに作り込むと、Step 5 で LLM が担う分解と二重になる（Issue #29）。
 * 答えられない側面は元々ここに列挙されており、変わるのは「他が当たっても報告するか」だけ。
 */
function collectPartialGaps(area: ResolvedArea, genre: string | undefined, haystack: string): Unanswered[] {
  const gaps: Unanswered[] = [];

  // ジャンル指定の飲食が混ざっているとき、返す候補は飲食店データを除いたもの
  // （`usable` で除外済み）なので、ジャンルの問いは必ず未回答のまま残っている
  if (genre) gaps.push(cuisineGenreUnanswered(genre));

  if (area.kind === "representative") {
    if (area.alsoOutOfArea) gaps.push(outOfAreaUnanswered(area.alsoOutOfArea));
    if (area.area === "渋谷" && findFirstTerm(haystack, SHIBUYA_SIGHTSEEING_TERMS)) {
      gaps.push(shibuyaSightseeingUnanswered());
    }
  }

  return gaps;
}

/**
 * 部分欠損があるときだけ `gaps` を添える。無いときはキーごと省く
 * （空配列を返すと「欠損なし」と「欠損あり」を長さで判定させることになる）。
 */
function withGaps(answered: AnsweredSearch, gaps: readonly Unanswered[]): AnsweredSearch {
  const [first, ...rest] = gaps;
  return first ? { ...answered, gaps: [first, ...rest] } : answered;
}

/**
 * データセット検索。
 *
 * 判定の順番に意味がある。エリア外を先に弾き、キーワードが当たれば候補を返す。当たらなかった
 * ときに初めて、ジャンル指定の飲食（粒度不足）・渋谷の観光データ欠損（未公開）・分類指定の
 * 空振りを分け、最後にエリアだけの絞り込みへ落とす。ジャンル判定をエリアのフォールバックより
 * 後ろに回すと、答えられない問い（ラーメン）にエリアのデータセット一覧を返して欠損が消える。
 *
 * 答えられる興味と答えられない興味が1つの質問文に混ざっている場合（例「上野の美術館と
 * ラーメン」）は、答えられる候補を返したうえで、答えられなかった側面を `gaps` に載せる
 * （Issue #29）。すべて答えられないときは従来どおり `unanswered` を返す（`answered` ＋
 * 全部 `gaps` にはしない。それでは「答えがある」と嘘をつくことになる）。
 */
export function searchDatasets(input: SearchDatasetsInput): SearchDatasetsOutput {
  // 境界を通らない直接呼び出しでも壊れた値で応答を作らないよう、ここでも範囲に収める
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_SEARCH_LIMIT), 1), MAX_SEARCH_LIMIT);
  const haystack = [input.query, input.area ?? "", input.category ?? ""].join(" ");

  const area = resolveArea(input);
  if (area.kind === "out_of_area") return outOfAreaUnanswered(area.label);

  const inArea = area.kind === "unspecified" ? CATALOG : CATALOG.filter((entry) => entry.areas.includes(area.area));
  const matched = inArea
    .map((entry) => ({ entry, score: scoreEntry(entry, haystack) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.no - b.entry.no)
    .map((scored) => scored.entry);

  // ジャンル指定の飲食は、飲食店データで答えたことにしない（ジャンルの列が無いため）
  const genre = findFirstTerm(haystack, CUISINE_GENRE_TERMS);
  const usable = genre ? matched.filter((entry) => entry.datasetId !== RESTAURANT_DATASET_ID) : matched;
  if (genre && usable.length === 0) return cuisineGenreUnanswered(genre);

  const gaps = collectPartialGaps(area, genre, haystack);

  const answered = answeredCandidates(usable.slice(0, limit));
  if (answered) return withGaps(answered, gaps);

  if (area.kind === "representative" && area.area === "渋谷" && findFirstTerm(haystack, SHIBUYA_SIGHTSEEING_TERMS)) {
    return shibuyaSightseeingUnanswered();
  }

  // 分類を明示されたのに1件も当たらなかったときは、エリアだけの一覧へ落とさない。
  // 落とすと「神社」の問いにトイレや宿泊施設を返すことになる（指定を黙って捨てない）
  if (input.category?.trim()) {
    return unanswered(
      "other",
      `該当するオープンデータがありません。利用中の10データセットに「${input.category.trim()}」に対応するものがありません。`,
    );
  }

  // キーワードが当たらなくても、エリアが分かっていればそのエリアを収録したデータセットは
  // 事実として提示できる（「上野」だけの質問など）
  const byArea = area.kind === "representative" ? answeredCandidates(inArea.slice(0, limit)) : undefined;
  if (byArea) return withGaps(byArea, gaps);

  return unanswered(
    "other",
    "該当するオープンデータがありません。利用中の10データセットに、この条件に対応するものがありません。",
  );
}

/**
 * 出典に添える「実行したクエリ」。
 *
 * スタブは SQL を実行していないので、SQL 風の文字列を返すと「実行した」という嘘になる。
 * 実際に行ったこと（どのスナップショットの何行目を固定で返したか）をそのまま書く。
 * 行番号はヘッダを除いたデータ行の番号なので、辿る人が1行ずれないよう出力にも明記する。
 */
const describeQuery = (entry: CatalogEntry, sample: CatalogSample): string =>
  `固定データ抽出（スタブ）: data/${entry.datasetId}/data.csv（${entry.retrievedAt} 取得・全${entry.rowCount}行）のヘッダを除く ${sample.sourceRow} 行目。Step 5 で Text-to-SQL に置き換える。`;

/**
 * 集計・抽出。固定データから1件を返す。
 *
 * **エリアを指定されたら、そのエリアの行しか返さない。** 一致する行が無いときに先頭行へ
 * フォールバックすると、「浅草の銭湯」に上野の銭湯を実在する出典つきで返すことになる。
 * 出典が本物であるぶん誤りが見つけにくく、推測で埋めるより質が悪い（CLAUDE.md 絶対ルール #1・#2）。
 */
export function aggregateDataset(input: AggregateDatasetInput): AggregateDatasetOutput {
  const datasetId = input.datasetId.trim();
  const entry = findEntry(datasetId);
  if (!entry) {
    // オープンデータの欠損ではなく呼び出し側の指定違い。`data_not_published` に混ぜると
    // 未回答の集計（DOMAIN.md §7）が汚れるため `other` に置く
    return unanswered(
      "other",
      `該当するオープンデータがありません。データセットID「${datasetId}」は利用中の10件に含まれていません。`,
    );
  }

  const genre = findFirstTerm(input.intent, CUISINE_GENRE_TERMS);
  if (genre && entry.datasetId === RESTAURANT_DATASET_ID) {
    return unanswered(
      "insufficient_granularity",
      `「${entry.title}」はジャンルの列を持たないため、「${genre}」の粒度では抽出できません。`,
    );
  }

  if (entry.samples.length === 0) {
    return unanswered(
      "insufficient_granularity",
      `「${entry.title}」は施設一覧ではなく集計表のため、個別の地物を抽出できません。`,
    );
  }

  // エリアの判定は searchDatasets と揃える。片方だけ対象エリア外を弾くと、
  // 検索で弾かれた問いが集計では答えられてしまう
  const nonTarget = findNonTargetArea(input.intent);
  if (nonTarget) {
    return unanswered(
      "out_of_area",
      `「${nonTarget}」は POC の対象エリア（${REPRESENTATIVE_AREAS.join("・")}）の外です。`,
    );
  }

  const extracted = (sample: CatalogSample): AggregateDatasetOutput => ({
    status: "answered",
    result: { name: sample.name, summary: sample.summary },
    query: describeQuery(entry, sample),
  });

  const intendedArea = findRepresentativeArea(input.intent);
  if (!intendedArea) return extracted(entry.samples[0]);

  const sample = entry.samples.find((candidate) => candidate.area === intendedArea);
  if (sample) return extracted(sample);

  return entry.areas.includes(intendedArea)
    ? // `areas` にあるのに固定データが無い ＝ スタブ側の欠落。データそのものの欠損と混ぜない
      unanswered(
        "other",
        `「${entry.title}」は「${intendedArea}」を収録していますが、スタブの固定データにその行がありません。`,
      )
    : unanswered("data_not_published", `「${entry.title}」は「${intendedArea}」の地物を収録していません。`);
}

/**
 * 出典取得。
 *
 * 知らない ID が1つでも混じっていたら、既知のぶんだけ返すのではなく全体を `unanswered` にする。
 * 黙って落とすと、呼び出し側は「出典が揃った」と誤認したまま画面に出してしまう。
 */
export function getProvenance(input: GetProvenanceInput): GetProvenanceOutput {
  // 出典0件の「回答あり」は仕様違反（DOMAIN.md §8 不変条件1）。これは未回答ではなく
  // 呼び出し側の契約違反なので、`unanswered` の統計に混ぜず例外にする（500 として記録される）
  if (input.datasetIds.length === 0) {
    throw new TypeError("getProvenance には1件以上の datasetIds が必要です");
  }

  const resolved: CatalogEntry[] = [];
  const unknown: string[] = [];
  for (const id of input.datasetIds) {
    const entry = findEntry(id.trim());
    if (entry) resolved.push(entry);
    else unknown.push(id);
  }

  if (unknown.length > 0) {
    return unanswered(
      "other",
      `出典を生成できません。データセットID ${unknown.join("・")} は利用中の10件に含まれていません。`,
    );
  }

  // 同じデータセットを複数回渡されても出典は1つ。重複したチップを画面に出さない
  const unique = resolved.filter((entry, index) => resolved.indexOf(entry) === index);
  const [first, ...rest] = unique;
  if (!first) {
    // unknown が空かつ datasetIds が非空なら必ず1件以上ある。型の証明のための分岐
    throw new TypeError("出典を生成できません（到達しないはずの分岐）");
  }

  const toSource = (entry: CatalogEntry) => ({
    datasetId: entry.datasetId,
    datasetTitle: entry.title,
    provider: entry.provider,
    license: entry.license,
    url: entry.url,
    query: input.query,
    retrievedAt: entry.retrievedAt,
  });

  return { status: "answered", sources: [toSource(first), ...rest.map(toSource)] };
}
