import type {
  AggregateDatasetInput,
  AggregateDatasetOutput,
  DatasetCandidate,
  Gap,
  GetProvenanceInput,
  GetProvenanceOutput,
  NonEmpty,
  RepresentativeArea,
  SearchDatasetsInput,
  SearchDatasetsOutput,
  Unanswered,
} from "../../shared/core";
import { REPRESENTATIVE_AREAS } from "../../shared/core";
import { CATALOG, findEntry, RESTAURANT_DATASET_ID, type CatalogEntry, type CatalogSample } from "./catalog";
import type { GapRecord, GapRecorder } from "./gaps";
import {
  areaOnlyFallbackUnanswered,
  askedAreas,
  categoryMissUnanswered,
  collectPartialGaps,
  CUISINE_GENRE_TERMS,
  cuisineGenreUnanswered,
  ETIQUETTE_TERMS,
  etiquetteUnanswered,
  findFirstTerm,
  findNonTargetArea,
  findRepresentativeArea,
  hasContentBeyondArea,
  normalizedList,
  outOfAreaAskedGaps,
  outOfAreaUnanswered,
  reportableInterests,
  resolveArea,
  scoreEntry,
  selectWithInterestCoverage,
  SHIBUYA_SIGHTSEEING_TERMS,
  shibuyaSightseeingUnanswered,
  unanswered,
  unansweredAskedAreaGap,
  uncoveredAreaGaps,
  uncoveredInterestGaps,
} from "./search-gaps";

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
 *
 * 3操作はいずれも記録器（`GapRecorder`）を**必須の引数**として受け取り、返す未回答を
 * `gaps` テーブルへ記録する（Issue #27・DOMAIN.md §8 不変条件4）。理由は `gaps.ts` を参照。
 *
 * 語彙・エリア解決・欠損の生成は `search-gaps.ts` に分離してある（Issue #71）。
 * このファイルが持つのは**判定の順序**（どの分岐がどの欠損を返すか）と応答の組み立て・記録。
 */

/** 候補件数の既定値。フロントエンドが1ルートに3〜4停留地を想定している（API_REQUIREMENTS.md §1） */
export const DEFAULT_SEARCH_LIMIT = 4;
/** 候補件数の上限。利用データセットが10件しかないため、それ以上は意味を持たない */
export const MAX_SEARCH_LIMIT = 10;


const toCandidate = (entry: CatalogEntry): DatasetCandidate => ({
  datasetId: entry.datasetId,
  title: entry.title,
  provider: entry.provider,
  url: entry.url,
  matchReason: entry.matchReason,
});

type AnsweredSearch = Extract<SearchDatasetsOutput, { status: "answered" }>;
type UnansweredSearch = Extract<SearchDatasetsOutput, { status: "unanswered" }>;

/**
 * 理由が覆っていない構造化欠損を、未回答応答に添える（Issue #70）。無ければキーごと省く。
 *
 * 載せるのは `areas` 由来の `out_of_area` だけ（shared/core.ts の doc 参照 — 興味ごとの
 * 欠損 message は「返した候補」を前提にしており、候補が存在しない未回答の文脈では嘘になる）。
 */
function unansweredWith(base: Unanswered, gaps: readonly Gap[]): UnansweredSearch {
  const [first, ...rest] = gaps;
  return first ? { ...base, gaps: [first, ...rest] } : base;
}

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
 * 部分欠損があるときだけ `gaps` を添える。無いときはキーごと省く
 * （空配列を返すと「欠損なし」と「欠損あり」を長さで判定させることになる）。
 */
function withGaps(answered: AnsweredSearch, gaps: readonly Gap[]): AnsweredSearch {
  const [first, ...rest] = gaps;
  return first ? { ...answered, gaps: [first, ...rest] } : answered;
}

// ---------------------------------------------------------------------------
// 未回答の記録（Issue #27）
// ---------------------------------------------------------------------------

/**
 * 記録に添える文脈。
 *
 * **応答の形からは復元できない値**（解決後のエリアなど）を運ぶためにある。
 * 応答の `message` から地名を抜き出す実装にすると、文言を直した瞬間に集計が壊れる。
 */
type GapContext = { question: string; area?: string; category?: string };

type CoreOutput = SearchDatasetsOutput | AggregateDatasetOutput | GetProvenanceOutput;

/**
 * 応答に含まれる未回答を、すべて `gaps` の行にする。
 *
 * `answered` に載る部分欠損（Issue #29）も1件ずつ行にする。ここを `unanswered` だけに
 * すると、#29 で可視化したばかりの部分欠損が記録に残らず、DOMAIN.md §8 不変条件4 が
 * **一番効いてほしい場所で**破れる。
 *
 * 重複排除はしない。同じ未回答が何度起きたかを数えられる形にしておく（Issue #27 の AC）。
 *
 * **エリアは欠損ごとに違いうる**（Issue #52）。「上野・渋谷」は上野の候補を返しつつ渋谷に
 * 答えていないので、その行の `area` は応答全体の「上野」ではなく「渋谷」でなければ、
 * どのエリアに答えられなかったかを集計できない。自分のエリアを持たない欠損は従来どおり
 * 応答全体の値を使う。
 */
function toGapRecords(output: CoreOutput, context: GapContext): GapRecord[] {
  // `gaps` を持つのは search_datasets だけ。`answered` の部分欠損（Issue #29）に加え、
  // `unanswered` にも構造化入力由来の欠損が載る（Issue #70）ので、両方の status で行にする
  const gaps = "gaps" in output ? (output.gaps ?? []) : [];
  const gapRows = gaps.map((gap) => ({ ...context, area: gap.area ?? context.area, reason: gap.reason }));
  if (output.status === "unanswered") return [{ ...context, reason: output.reason }, ...gapRows];
  return gapRows;
}

/**
 * 応答を記録してから返す。
 *
 * 各 return 地点ではなく**応答が確定した1か所**で記録する。return 地点ごとに書くと、
 * 分岐を足した人が記録を書き忘れても何も壊れない（記録の欠落は応答を壊さないため、
 * テストでも本番でも気づけない）。
 */
async function recorded<T extends CoreOutput>(output: T, context: GapContext, recorder: GapRecorder): Promise<T> {
  await recorder.record(toGapRecords(output, context));
  return output;
}

/**
 * データセット検索。
 *
 * 判定の順番に意味がある。エリア外を先に弾き、キーワードが当たれば候補を返す。当たらなかった
 * ときに初めて、ジャンル指定の飲食（粒度不足）・マナー・作法の調査済み欠損（未公開・
 * Issue #43）・渋谷の観光データ欠損（未公開）・分類指定の空振りを分け、最後にエリアだけの
 * 絞り込みへ落とす。ジャンル判定・マナー判定をエリアのフォールバックより後ろに回すと、
 * 答えられない問い（ラーメン・浅草のマナー）にエリアのデータセット一覧を返して欠損が消える。
 *
 * 答えられる興味と答えられない興味が1つの質問文に混ざっている場合（例「上野の美術館と
 * ラーメン」）は、答えられる候補を返したうえで、答えられなかった側面を `gaps` に載せる
 * （Issue #29）。載せるのは `collectPartialGaps` が語から判定できる3つ（ジャンル指定の飲食・
 * マナー・作法・渋谷の観光データ未公開）だけで、**自然文を興味に分解することはしない**。
 *
 * すべて答えられないときは従来どおり `unanswered` を返す（`answered` ＋ 全部 `gaps` には
 * しない。それでは「答えがある」と嘘をつくことになる）。ただし `unanswered` は理由を
 * **1つしか運べない**ため、複数の側面が同時に答えられない場合（渋谷の寺とラーメン）は
 * 先に判定されたものだけが返る。記録（Issue #27）もその1件になる。「浅草のラーメンの
 * マナー」はジャンル判定が先に返るため、マナーの記録は残らない — ADR-010 の頻度集計に
 * とって既知の取りこぼし。
 *
 * 最後のエリア・フォールバックは、キーワードが1件も当たらなくてもそのエリアを収録した
 * データセットを返す。エリアだけを訊かれた（「上野」）ならそれが答えそのものだが、
 * **エリア名のほかに何か訊かれていた**（「ナイトライフ、渋谷」）ならこの一覧は答えではないので、
 * 答えられていないことを `gaps` に添える（Issue #50）。添えないと、無関係な候補に本物の出典が
 * 付いたまま「回答あり」として返り、画面にも記録にも痕跡が残らない（DOMAIN.md §8 不変条件4）。
 *
 * **訊かれた代表エリアを候補が覆っていなければ、それも `gaps` に載せる**（Issue #52）。
 * 「上野・渋谷」の候補は絞り込みに使った上野の分だけなので、渋谷に答えていないことを添える。
 * これは `answered` を返す**どの経路でも**行う（フォールバック経路だけに付けると、Issue #50 と
 * 同じ非対称——実際に旅程が組み上がるケースほど発火しない——を作り直すことになる）。
 *
 * **経路によって添える `gaps` の数が違う。** 以前この doc コメントには「`answered` を返す
 * どの経路でも同じ `gaps` を添える」と書いてあったが、Issue #50 でフォールバック経路だけ
 * 1件多くなったため事実でなくなった（API.md §3.1 も同時に直した）。Issue #52 の欠損は
 * それとは独立に付くので、フォールバック経路の `gaps` は**1件とは限らない**。
 *
 * **興味の取り落としは、構造化入力 `interests` を送った呼び出しでだけ報告できる**
 * （[Issue #53](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/53)／ADR-011）。
 * `query` に畳み込んだ自然文だけだと、キーワードが1件でも当たれば `answered` になり、
 * 答えていない興味は応答のどこにも残らない（「ナイトライフ、上野で夜遊びしたい」は銭湯の
 * キーワード「夜」が「夜遊び」に部分一致する）。どの興味に答えたかを判定するには興味を
 * 畳み込む前の列として受けるしかなく、質問文からの分解は Step 5 の LLM 側の仕事
 * （スタブに形態素解析を持ち込まない）。`interests` を送らない呼び出しでは従来どおり
 * 内容の取り落ちは報告されない。**エリア**の取り落ちは上記のとおりキーワード経路でも報告する。
 */
export async function searchDatasets(
  input: SearchDatasetsInput,
  recorder: GapRecorder,
): Promise<SearchDatasetsOutput> {
  // 構造化入力は判定と記録の両方で使うので、1か所で正規化してから両方へ渡す
  const normalized: SearchDatasetsInput = {
    ...input,
    areas: normalizedList(input.areas),
    interests: normalizedList(input.interests),
  };
  return recorded(computeSearchDatasets(normalized), searchGapContext(normalized), recorder);
}

/**
 * 記録に添えるエリアは**解決後の値**。入力の `area` をそのまま入れない。
 *
 * 「新宿の美術館」（`area` 未指定）が `out_of_area` で返るとき、集計に効くのは
 * 質問文から解決した「新宿」であって、未指定の `area` ではない。
 */
function searchGapContext(input: SearchDatasetsInput): GapContext {
  const area = resolveArea(input);
  // 構造化入力の興味は question に畳み込んで記録する（フロントエンドが自然文へ畳み込む形と
  // 同じ「、」区切り）。列を足すまでは、これが「何を訊かれたか」を1列で見る唯一の手段。
  // 興味も質問文も無い呼び出し（areas だけの直接呼び出し）では areas を使う —
  // question が空の行は「何を訊かれたか」を集計から読めなくする
  const parts = [...(input.interests ?? []), input.query ?? ""].filter((part) => part.trim() !== "");
  const question = (parts.length > 0 ? parts : (input.areas ?? [])).join("、");
  return {
    question,
    area: area.kind === "representative" ? area.area : area.kind === "out_of_area" ? area.label : undefined,
    category: input.category?.trim() || undefined,
  };
}

function computeSearchDatasets(input: SearchDatasetsInput): SearchDatasetsOutput {
  // 境界を通らない直接呼び出しでも壊れた値で応答を作らないよう、ここでも範囲に収める
  const limit = Math.min(Math.max(Math.trunc(input.limit ?? DEFAULT_SEARCH_LIMIT), 1), MAX_SEARCH_LIMIT);
  // 構造化入力の興味もマッチの対象に含める。含めないと、興味を畳み込んだ自然文で
  // 当たっていた候補が、構造化して送った途端に当たらなくなる。
  // `areas` は**含めない** — 地名は内容ではなく絞り込みの対象で、部分一致の haystack に
  // 入れると「新宿」が宿泊施設のキーワード「宿」に当たる類の誤マッチを作る
  // （`query` に書かれた地名が当たるのは従来からの挙動なので変えない）
  const haystack = [input.query ?? "", ...(input.interests ?? []), input.area ?? "", input.category ?? ""].join(" ");

  const area = resolveArea(input);

  // `areas` で目的地と明示された対象エリア外（Issue #58）。応答が `unanswered` になる経路でも
  // 落とさず添える（Issue #70）。応答全体が `out_of_area` の場合は、理由が報告する地名を除く
  const outOfAreaAsked = outOfAreaAskedGaps(input);
  if (area.kind === "out_of_area") {
    return unansweredWith(
      outOfAreaUnanswered(area.label),
      outOfAreaAsked.filter((gap) => gap.area !== area.label),
    );
  }

  // 訊かれたエリアのうち、実際に返す候補が収録していないものを欠損にする（Issue #52）。
  // 候補が決まらないと判定できないので、`answered` を作る各地点で呼ぶ
  const asked = askedAreas(input);
  const uncovered = (entries: readonly CatalogEntry[]): Gap[] =>
    area.kind === "representative" ? uncoveredAreaGaps(asked, area.area, entries) : [];

  // `unanswered` を返す経路に添える構造化欠損（Issue #70）: 明示された対象エリア外に加え、
  // 目的地と明示された代表エリアの2件目以降も落とさない。質問文からの推測（過検知の側に
  // 倒してある）まで載せると query だけの未回答の記録が過検知ぶん膨らむので、
  // `areas`（構造化入力）で明示された場合に限る
  const unansweredExtras: Gap[] = [
    ...outOfAreaAsked,
    ...(input.areas && area.kind === "representative"
      ? asked.filter((name) => name !== area.area).map(unansweredAskedAreaGap)
      : []),
  ];

  const inArea = area.kind === "unspecified" ? CATALOG : CATALOG.filter((entry) => entry.areas.includes(area.area));
  const matched = inArea
    .map((entry) => ({ entry, score: scoreEntry(entry, haystack) }))
    .filter((scored) => scored.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.no - b.entry.no)
    .map((scored) => scored.entry);

  // ジャンル指定の飲食は、飲食店データで答えたことにしない（ジャンルの列が無いため）。
  // 以降の unanswered 早期 return はいずれも `outOfAreaAsked` を添える（Issue #70） —
  // 添えないと、目的地と明示された対象エリア外の欠損が応答からも記録からも消える
  const genre = findFirstTerm(haystack, CUISINE_GENRE_TERMS);
  const usable = genre ? matched.filter((entry) => entry.datasetId !== RESTAURANT_DATASET_ID) : matched;
  if (genre && usable.length === 0) return unansweredWith(cuisineGenreUnanswered(genre), unansweredExtras);

  // マナー・作法の問いにキーワードが1件も当たらなければ、調査済みの欠損として返す
  // （Issue #43・ADR-010）。エリア・フォールバックより手前に置くのはジャンル判定と同じ理由 —
  // 後ろに回すと「浅草のマナー」に浅草の一覧を返して欠損が消える
  if (usable.length === 0 && findFirstTerm(haystack, ETIQUETTE_TERMS)) {
    return unansweredWith(etiquetteUnanswered(), unansweredExtras);
  }

  const gaps = collectPartialGaps(area, genre, haystack);

  // 興味カバレッジ優先（Issue #84）。切り捨てで消える候補と、覆えていない興味の判定が
  // 同じ述語を見るようにして、「枠に入らなかっただけ」を欠損として見せない
  const selected = selectWithInterestCoverage(usable, limit, reportableInterests(input, area, genre));
  const answered = answeredCandidates(selected);
  if (answered) {
    return withGaps(answered, [
      ...gaps,
      ...uncoveredInterestGaps(input, area, genre, selected),
      ...outOfAreaAsked,
      ...uncovered(selected),
    ]);
  }

  if (area.kind === "representative" && area.area === "渋谷" && findFirstTerm(haystack, SHIBUYA_SIGHTSEEING_TERMS)) {
    return unansweredWith(shibuyaSightseeingUnanswered(), unansweredExtras);
  }

  // 分類を明示されたのに1件も当たらなかったときは、エリアだけの一覧へ落とさない。
  // 落とすと「動物園」の問いに名所・史跡やトイレを返すことになる（指定を黙って捨てない）。
  //
  // なおこのガードは `category` を送る呼び出し（API コンソール・将来の `/mcp`）にしか効かない。
  // プラン画面は興味も要望も `query` に畳み込むため（`buildPlan.ts` の `buildQuery`）ここを通らず、
  // 下のエリア・フォールバックへ落ちる。そちら側の手当ては Issue #50 で入れた
  if (input.category?.trim()) {
    return unansweredWith(categoryMissUnanswered(area, input.category.trim()), unansweredExtras);
  }

  // キーワードが当たらなくても、エリアが分かっていればそのエリアを収録したデータセットは
  // 事実として提示できる（「上野」だけの質問など）。
  //
  // ただし**エリア名のほかに何か訊かれていた**場合（「ナイトライフ、渋谷」など）、この一覧は
  // 訊かれた内容の答えではない。答えられていないことを添えないと、無関係な候補に本物の出典が
  // 付いたまま「回答あり」として返り、画面にも `gaps` テーブルにも痕跡が残らない（Issue #50）。
  // 記録は `recorded` が `gaps` から作るので、ここで添えれば D1 にも入る。
  //
  // 返す配列は最大5つの出所を連結したもので、**それぞれ空になる条件が違う**。
  //  1. `gaps`（`collectPartialGaps` の語からの判定）— ここでは必ず空。集める3つはいずれも
  //     このフォールバックより手前で `unanswered` として return されている（ジャンル指定の
  //     飲食は上の `genre && usable.length === 0`、マナー語はその直後、渋谷の観光語は
  //     直前の分岐。条件は同一）。
  //     spread は、将来 `collectPartialGaps` に語が増えたときに取り落とさないためだけに残す
  //  2. 興味の取り落ち — 覆えなかった興味の数だけ（Issue #53。この経路ではキーワードが
  //     1件も当たっていないので、報告済みの既知欠損に対応する興味を除いた全件が載る）
  //  3. エリア・フォールバックの欠損 — 質問文にエリア名のほかに何か書かれていれば1件（Issue #50）
  //  4. `areas` で目的地と明示された対象エリア外 — その数だけ（Issue #58）
  //  5. 訊かれたエリアの取り落ち — 覆えなかったエリアの数だけ（Issue #52）
  //
  // 2〜5 は独立に付くので、**この経路が返す欠損は1件とは限らない**。「上野・渋谷の公園」は
  // 「内容に答えていない」と「渋谷を覆えていない」の2件になる。
  if (area.kind === "representative") {
    const selectedByArea = inArea.slice(0, limit);
    const byArea = answeredCandidates(selectedByArea);
    if (byArea) {
      return withGaps(byArea, [
        ...gaps,
        ...uncoveredInterestGaps(input, area, genre, selectedByArea),
        ...(hasContentBeyondArea(input.query ?? "") ? [areaOnlyFallbackUnanswered(area.area)] : []),
        ...outOfAreaAsked,
        ...uncovered(selectedByArea),
      ]);
    }
  }

  // 最後のフォールバック。ここに来るのはエリアも分類も無くキーワードが1件も当たらなかった
  // 場合で、実装が知っているのは「全10件のキーワード表に当たらなかった」ことだけ。
  // `categoryMissUnanswered` と同じ判断（Issue #59）で、「対応するものが無い」とは断定しない。
  // 興味だけの呼び出し（query 省略）に「質問文の語」と書くと、存在しないものを照合したと
  // 読めてしまうので、照合に使った入力に合わせて言い分ける（実際に行ったことだけを書く）
  const askedLabel = input.interests?.length ? "質問文・興味の語" : "質問文の語";
  return unansweredWith(
    unanswered(
      "other",
      `該当するオープンデータが見つかりませんでした。利用中の10データセットのキーワードには、${askedLabel}に当たるものがありませんでした。`,
    ),
    unansweredExtras,
  );
}

/**
 * 出典に添える「実行したクエリ」。
 *
 * スタブは SQL を実行していないので、SQL 風の文字列を返すと「実行した」という嘘になる。
 * 実際に行ったこと（どのスナップショットの何行目を、どう選んで固定で返したか）をそのまま書く。
 * 行番号はヘッダを除いたデータ行の番号なので、辿る人が1行ずれないよう出力にも明記する。
 *
 * 「intent の内容との照合はしていない」は選定根拠の側ではなくここに置く。スタブの抽出は
 * どの経路でも内容を照合していない（エリアで絞るだけ）ので、経路ごとの書き分けに任せると
 * 書き漏れた経路が「照合済み」に見えてしまう（Issue #78）。
 */
const describeQuery = (entry: CatalogEntry, sample: CatalogSample, selection: string): string =>
  `固定データ抽出（スタブ）: data/${entry.datasetId}/data.csv（${entry.retrievedAt} 取得・全${entry.rowCount}行）のヘッダを除く ${sample.sourceRow} 行目（${selection}。intent の内容との照合はしていない）。Step 5 で Text-to-SQL に置き換える。`;

/**
 * 集計・抽出。固定データから1件を返す。
 *
 * **エリアを指定されたら、そのエリアの行しか返さない。** 一致する行が無いときに先頭行へ
 * フォールバックすると、「浅草の銭湯」に上野の銭湯を実在する出典つきで返すことになる。
 * 出典が本物であるぶん誤りが見つけにくく、推測で埋めるより質が悪い（CLAUDE.md 絶対ルール #1・#2）。
 */
export async function aggregateDataset(
  input: AggregateDatasetInput,
  recorder: GapRecorder,
): Promise<AggregateDatasetOutput> {
  return recorded(computeAggregateDataset(input), aggregateGapContext(input), recorder);
}

/**
 * 対象外の地名を代表エリアより先に見るのは、`computeAggregateDataset` の判定順に揃えるため
 * （検索とは違い、集計は対象エリア外を無条件で弾く）。
 */
const aggregateGapContext = (input: AggregateDatasetInput): GapContext => ({
  question: input.intent,
  area: findNonTargetArea(input.intent) ?? findRepresentativeArea(input.intent),
});

function computeAggregateDataset(input: AggregateDatasetInput): AggregateDatasetOutput {
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
      `「${nonTarget}」はこのアプリの対象エリア（${REPRESENTATIVE_AREAS.join("・")}）の外です。`,
    );
  }

  const extracted = (sample: CatalogSample, selection: string): AggregateDatasetOutput => ({
    status: "answered",
    result: { name: sample.name, summary: sample.summary },
    query: describeQuery(entry, sample, selection),
  });

  const intendedArea = findRepresentativeArea(input.intent);
  // 既知のエリア名が見つからなければ固定サンプルの先頭を代表として返す（スタブ）。
  // 「エリア無指定」と断定しない — 確認したのは既知の語彙表（代表・対象外）に当たらなかった
  // ことだけで、未知の地名（例: 巣鴨）が書かれていてもここに来る。返す行に intent との
  // 適合根拠が無いことは describeQuery が query に明記する（Issue #78。#50 と同じく、
  // 検証していないものを検証済みに見せない）。内容適合そのものは Step 5（Issue #32）で解消する
  if (!intendedArea) {
    return extracted(entry.samples[0], "既知のエリア名が intent から見つからず、固定サンプルの先頭を選定");
  }

  const sample = entry.samples.find((candidate) => candidate.area === intendedArea);
  if (sample) return extracted(sample, `固定サンプルのうち「${intendedArea}」の最初の1件を選定`);

  return entry.areas.includes(intendedArea)
    ? // `areas` にあるのに固定データが無い ＝ スタブ側の欠落。データそのものの欠損と混ぜない
      rowMissingUnanswered(entry.title, intendedArea)
    : areaNotPublishedUnanswered(entry.title, intendedArea);
}

/**
 * `areas` に収録があるのに固定サンプルの行が無いときの未回答（Issue #99）。
 *
 * **この分岐はスイートを通るどのカタログからも到達しない。** `scripts/catalog-samples.test.ts`
 * の「収録エリアには必ず固定データがある」が `areas` ⊇ 固定サンプルのエリアを両方向で
 * 強制しており、`samples` が空の集計表は手前の分岐で弾かれる。つまり文面を切り出したのは
 * 「カタログを増やしたときの備え」ではなく、**その不変条件テストを緩めた人に対する多層防御**
 * である。緩めようとしている場合は先に上記テストを読むこと。
 *
 * 呼び出し経由で踏めない文面はテストで固定できないので、ヘルパとして export して直接固定する
 * （`search-gaps.ts` の文面ヘルパと同じ形）。
 */
export const rowMissingUnanswered = (title: string, area: RepresentativeArea): Unanswered =>
  unanswered(
    "other",
    `「${title}」は「${area}」を収録していますが、このアプリではまだその内容を取り出せません。`,
  );

/**
 * `areas` に無いエリアを求められたときの未回答。
 *
 * `data_not_published`（「存在しないことを確かめられた場合。最も強い主張」・shared/core.ts）を
 * 使える根拠は、**カタログ10件がすべて区単位で提供されていること**（台東区8件・渋谷区1件）。
 * `areas` 自体は町字マッピングで解決できた行の範囲でしかなく（`scripts/lib/area.ts`。未知の
 * 町字は `null` になり、めぐりん停留所72件のうち40件が判定不能 — DATABASE.md §2）、
 * 「`areas` に無い」ことだけでは不在の証明にならない。**区をまたがないデータセットを足すときは、
 * この分類が過剰主張にならないか読み直すこと**（絶対ルール #1）。
 */
export const areaNotPublishedUnanswered = (title: string, area: RepresentativeArea): Unanswered =>
  unanswered("data_not_published", `「${title}」は「${area}」の地物を収録していません。`);

/**
 * 出典取得。
 *
 * 知らない ID が1つでも混じっていたら、既知のぶんだけ返すのではなく全体を `unanswered` にする。
 * 黙って落とすと、呼び出し側は「出典が揃った」と誤認したまま画面に出してしまう。
 *
 * **例外（`datasetIds` が空）は記録しない。** あれは「答えが無い」ではなく呼び出し側の
 * 契約違反で、`gaps` に混ぜるとデータ欠損の集計に自分たちのバグが積み上がる。
 * 例外は `recorded` に到達する前に投げられるので、構造としてそうなっている。
 */
export async function getProvenance(
  input: GetProvenanceInput,
  recorder: GapRecorder,
): Promise<GetProvenanceOutput> {
  return recorded(computeGetProvenance(input), { question: input.query }, recorder);
}

function computeGetProvenance(input: GetProvenanceInput): GetProvenanceOutput {
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
