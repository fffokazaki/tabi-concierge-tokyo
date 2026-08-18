import type { Gap, RepresentativeArea, SearchDatasetsInput, Unanswered, UnansweredReason } from "../../shared/core";
import { REPRESENTATIVE_AREAS } from "../../shared/core";
import type { CatalogEntry } from "./catalog";

/**
 * `search_datasets` の語彙とエリア解決・欠損（`gaps`）生成（Issue #71 で operations.ts から分離）。
 *
 * ここに置くのは**入力の解釈と「答えられていない」の判定・文言**:
 * - 既知の語彙（ジャンル・マナー・渋谷観光・対象エリア外の地名）と照合ヘルパ
 * - エリア解決（`resolveArea` / `askedAreas`）と構造化入力の正規化（ADR-011）
 * - 未回答・部分欠損の message 工場と、欠損の収集（Issue #29 / #50 / #52 / #53 / #58 / #70）
 *
 * 3操作の**判定の順序**（どの分岐がどの欠損を返すか）は operations.ts が持つ。
 * 順序に意味がある（`searchDatasets` の doc 参照）ため、ここの関数は順序を仮定しない
 * 純粋な判定・生成に限る。message の文言は API.md §4 と対応する契約（ACE-62-3）。
 */
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
export const CUISINE_GENRE_TERMS = [
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
export const SHIBUYA_SIGHTSEEING_TERMS = ["観光", "名所", "史跡", "寺", "神社", "美術館", "博物館", "文化施設"];

/** 最初に見つかった語を返す。どれも含まれなければ undefined */
export const findFirstTerm = (haystack: string, needles: readonly string[]): string | undefined =>
  needles.find((needle) => haystack.includes(needle));

/** 対象エリア外の地名を返す。誤爆語（銀座線など）が一緒に現れる場合は判定しない */
export const findNonTargetArea = (text: string): string | undefined =>
  NON_TARGET_AREAS.find(
    (area) => text.includes(area.name) && !area.notWhen?.some((exclusion) => text.includes(exclusion)),
  )?.name;

/** 既知の地名（代表エリア＋対象外）。エリア以外に何か訊かれていたかの判定に使う */
const AREA_NAMES: readonly string[] = [...REPRESENTATIVE_AREAS, ...NON_TARGET_AREAS.map((area) => area.name)];

/**
 * 区切り記号と空白。使い道は `hasContentBeyondArea` の1箇所だけで、除去後の文字列は
 * **空かどうかしか見ない**（語の照合には使わない）。網羅を広げても下流の判定は変わらない。
 */
const SEPARATORS = /[\s、。，．,.・…〜～「」『』（）()【】？?！!／/：:；;]/g;

/**
 * 質問文に**エリア名のほかに何か書かれていたか**を返す（Issue #50）。
 *
 * 「上野」だけを訊かれたのか、「ナイトライフ（を上野で）」のように内容を訊かれたのかを
 * 分けるためだけに使う。前者はエリアのデータセット一覧が答えそのものだが、後者は
 * 訊かれた内容に答えられていないので、それを黙って落とさない。
 *
 * **語には分解しない。** 日本語は分かち書きしないため内容語を取り出すには形態素解析が要り、
 * 分解の規則をスタブに作り込むと Step 5 で LLM が担う分解と二重になる（Issue #29 と同じ理由）。
 * ここで必要なのは「エリア名以外が残るか」の一点だけなので、既知の地名と区切り記号を
 * 落として残りが空かどうかだけを見る。助詞は落とさない（品詞の知識を持ち込まない）ので、
 * 「上野で」のような書き方は内容ありと判定される。過検知の側に倒してある。
 *
 * **複数の代表エリアが書かれた場合はここでは拾えない。** 「上野・渋谷」はどちらもエリア名
 * なので残余が空になり、この関数は「エリアだけの質問」と答える。それは正しい（内容は
 * 訊かれていない）が、渋谷に答えていないことは別の話で、`uncoveredAreaGaps` が見る（Issue #52）。
 */
export const hasContentBeyondArea = (query: string): boolean => {
  const withoutAreas = AREA_NAMES.reduce((text, name) => text.split(name).join(""), query);
  return withoutAreas.replace(SEPARATORS, "") !== "";
};

export const unanswered = (reason: UnansweredReason, message: string): Unanswered => ({
  status: "unanswered",
  reason,
  message,
});

/**
 * 構造化入力の配列を正規化する（前後空白の除去・空要素の除去・重複の除去）。
 *
 * 境界（parse.ts）はトリム済みの値を渡すが、`worker/core/` は境界を通らずに直接呼ばれうる
 * （冒頭の doc）。既存の `area` が使用箇所で `trim()` しているのと同じ防御方針で、配列を
 * 入口で正規化しないと `["上野 "]`（末尾空白）が対象エリア外と判定され、答えられる問いに
 * 事実へ反する `out_of_area` を返す。
 *
 * **重複除去は1リクエスト内の話。** 記録の「重複排除はしない（何度訊かれたかを数える）」は
 * リクエスト**間**の頻度集計（DOMAIN.md §7）のためで、1リクエスト内の入力重複
 * （`interests: ["文化", "文化"]`）まで2行にすると、その集計が入力の重複で水増しされる。
 */
export const normalizedList = (values: readonly string[] | undefined): string[] | undefined =>
  values && [...new Set(values.map((value) => value.trim()).filter((value) => value !== ""))];

/**
 * 「答えられない」と実測で言い切れる既知の欠損。
 *
 * この4つは**応答全体の未回答としても、答えられた候補に添える部分欠損としても、同じ値を返す**
 * （Issue #29）。片方だけ文言を変えると、同じ欠損が呼び出し側で別物に見え、
 * 未回答の集計（DOMAIN.md §7）が分裂する。
 */

export const cuisineGenreUnanswered = (genre: string): Unanswered =>
  unanswered(
    "insufficient_granularity",
    `該当するオープンデータがありません。飲食店の店舗データは「東京都内の飲食店のバリアフリー情報」（210件・バリアフリー対応店に限定）のみで、ジャンルの列を持たないため「${genre}」の粒度では答えられません。`,
  );

export const outOfAreaUnanswered = (label: string): Unanswered =>
  unanswered(
    "out_of_area",
    `該当するオープンデータがありません。「${label}」は POC の対象エリア（${REPRESENTATIVE_AREAS.join("・")}）の外です。`,
  );

export const shibuyaSightseeingUnanswered = (): Unanswered =>
  unanswered(
    "data_not_published",
    "該当するオープンデータがありません。渋谷区のカタログ掲載データは17件で、観光ポイント・名所・文化施設に相当するデータは公開されていません（2026-08-16 調査）。",
  );

/**
 * マナー・作法の問いの語（Issue #43・ADR-010）。
 *
 * **調査で確認した語だけを載せる**（DATABASE.md §2「マナー解説のデータ欠損」・2026-08-17）。
 * 未調査の語（「礼儀」等）で `data_not_published` を返すのは推測になる。調査済みでも
 * 「参拝」は要求の語ではなく行為の語（「浅草寺に参拝したい」は寺社データで答えるべき問い）
 * なので載せない。「ピクトグラム」は利用者の質問文に現れない検索用語なので載せない。
 */
export const ETIQUETTE_TERMS = ["マナー", "作法", "エチケット", "おもてなし"];

/**
 * マナー解説の調査済み欠損（Issue #43・ADR-010）。
 *
 * カタログ約9,600件に存在しないことを確認済みなので、最も強い分類 `data_not_published` を
 * 使ってよい（迷ったら使わない、の例外条件を満たしている）。この欠損はカタログ外の出典で
 * 埋めず、**データ公開リクエストへの還元（エスカレーション）として扱う**。記録される旨を
 * message に書くのは、未回答が握りつぶされていないことを利用者に伝えるため
 * （DOMAIN.md §8 不変条件4）。問い合わせのたびに `gaps` へ積まれる記録の頻度が、
 * そのまま公開リクエストの根拠データになる（DOMAIN.md §7）。
 *
 * **「解説」と限定するのは、無いことを確かめたのがそこまでだから**（DATABASE.md §2.1）。
 * ルールを場所として公開したデータ（公衆喫煙所・ごみ分別・路上禁煙地区）は**カタログに
 * 存在する**（実体が全件リンク切れ・§2.2）ため、「マナーのデータが存在しない」とまで
 * 言うと事実に反する。その欠損は「公開されているが取得できない」で、GapReason に
 * 対応する値が無い（§2.3・現状 `other` に落ちる）ので、この分類の対象外。
 *
 * `aggregateDataset` にはミラーを置かない。ジャンル判定のミラーは「飲食店データという
 * 特定の1件が粒度不足」という構造があるから成立するもので、マナーには対応する
 * データセット自体が存在せず、同型のガードが書けない。
 */
export const etiquetteUnanswered = (): Unanswered =>
  unanswered(
    "data_not_published",
    "該当するオープンデータがありません。訪日観光客向けのマナー・作法の解説に相当するデータは、東京都オープンデータカタログに存在しないことを確認済みです（2026-08-17 調査）。この未回答は記録され、東京都へのデータ公開リクエストの題材になります。",
  );

/**
 * エリアだけで絞った一覧を返すとき、訊かれた内容に答えられていないことを添える（Issue #50）。
 *
 * `other` を使う。`data_not_published`（最も強い分類）は「カタログ側に無いことを確かめてある」
 * ときにしか使えず、ここに来る問い（ナイトライフ・ショッピングなど）は**未調査**なので、
 * 未公開と言い切ると推測で埋めることになる（CLAUDE.md 絶対ルール #1）。
 *
 * **質問文の残余を message に埋め込まない。** `buildQuery` は興味ラベルと自由文を「、」で
 * 連結するため、エリア名を除いた残余は「ナイトライフ、で夜遊びしたい」のように壊れた文字列に
 * なる。それを画面に出すと、欠損を可視化するための文が新たな意味不明な文字列の出所になる。
 *
 * **「利用中の10件に無い」と書かない。** 実装が知っているのは「キーワード表に当たらなかった」
 * だけで、10件が問いをカバーするかは判定していない。「ナイトライフ、上野」に対して銭湯
 * （営業時間 15:00〜0:00・キーワードに「夜」）は10件の中に実在するので、無いと断定すると
 * 推測で埋めることになる（CLAUDE.md 絶対ルール #1）。同じ10件から候補を出しながら
 * 「対応するものが無い」と言うのは、読み手から見て自己矛盾でもある。`describeQuery` と同じく
 * **実際に行ったことだけを書く**。
 */
export const areaOnlyFallbackUnanswered = (area: RepresentativeArea): Unanswered =>
  unanswered(
    "other",
    `該当するオープンデータがありません。質問文の語に当たるデータセットが無かったため、「${area}」を収録するデータセットを、エリアの事実として提示しています。`,
  );

/**
 * 訊かれたエリアのうち、返した候補が収録していないもの（Issue #52）。
 *
 * `unanswered` の頭に付く「該当するオープンデータがありません」を**使わない**。渋谷には
 * データがある（都市公園・都立公園一覧123件）のに返していないだけなので、無いと書くと嘘になる。
 * 実際に行ったこと（`answering` のエリアで絞り込んだ結果、このエリアのデータセットが
 * 候補に入っていない）だけを書く。
 *
 * `reason` は `other`。`data_not_published` は「カタログ側に無いことを確かめてある」場合に
 * しか使えず、`out_of_area` は対象エリア外の分類なので、対象エリアである渋谷には当たらない。
 */
const uncoveredAreaUnanswered = (area: RepresentativeArea, answering: RepresentativeArea): Gap => ({
  ...unanswered(
    "other",
    `「${area}」について訊かれましたが、返した候補はいずれも「${area}」を収録していません。候補は「${answering}」で絞り込んでいるためです。`,
  ),
  area,
});

const isRepresentativeArea = (value: string): value is RepresentativeArea =>
  (REPRESENTATIVE_AREAS as readonly string[]).includes(value);

/** 質問文に現れた代表エリア。複数あれば先に定義した順（上野→浅草→渋谷） */
export const findRepresentativeArea = (text: string): RepresentativeArea | undefined =>
  REPRESENTATIVE_AREAS.find((area) => text.includes(area));

/**
 * **訊かれた**代表エリアをすべて返す（Issue #52）。候補を絞り込む `resolveArea` とは別物で、
 * あちらは1つに決める（絞り込みは1エリアぶんしか行わない）。
 *
 * **`area` を明示されたらそれだけを見る。** 明示指定は質問文より優先する（API.md §3.1）ので、
 * `{ query: "上野の公園", area: "渋谷" }` の上野は呼び出し側が意図して外したものであって、
 * こちらが黙って落としたのではない。ここで拾うと、絞り込みの指定そのものが欠損として報告される。
 *
 * **`areas`（構造化入力・[Issue #58](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/58)／ADR-011）が
 * あればそれだけを信じ、質問文からの推測は行わない。** 「渋谷から上野へ」の渋谷（出発地）と
 * 「上野と渋谷を回りたい」の渋谷（目的地）は質問文の形だけでは見分けられず、見分けるには
 * 形態素解析をスタブに持ち込むことになる。区別を知っているのは呼び出し側なので、
 * 畳み込む前の構造化データ（目的地の配列）で受ける。空配列は「目的地なし」の明示。
 * 代表エリア以外の要素はここでは外す（`outOfAreaAskedGaps` が欠損として報告する）。
 *
 * **代表エリアだけを見る。** 対象エリア外の地名（`NON_TARGET_AREAS`）を混ぜると、
 * 「新宿から上野へ行きたい」の新宿＝出発地が欠損として報告される（Issue #29 の判断）。
 *
 * **質問文からの推測は、代表エリアについて過検知の側に倒したまま**（Issue #58 で確定した仕様）。
 * 「渋谷から上野の美術館へ」を `query` だけで送ると、出発地のつもりで書かれた渋谷も
 * 「訊かれた」と数えられて欠損になる。新宿と逆に倒すのは事情が違うため — 新宿は対象外で
 * **そもそも答えられない**が、渋谷は対象エリアでデータがあり、渋谷のデータも欲しい可能性が残る。
 * 出発地を落としたい呼び出しは `areas` を送る。質問文からの抽出は Step 5 の LLM 側の仕事。
 *
 * 境界を通らない直接呼び出しで `area` と `areas` を両方渡された場合は `areas` が優先
 * （境界は同時指定を 400 にするので、`/api/*` ではこの優先順は観測されない）。
 */
export function askedAreas(input: SearchDatasetsInput): readonly RepresentativeArea[] {
  if (input.areas) return input.areas.filter(isRepresentativeArea);
  const explicit = input.area?.trim();
  if (explicit) return isRepresentativeArea(explicit) ? [explicit] : [];
  return REPRESENTATIVE_AREAS.filter((area) => (input.query ?? "").includes(area));
}

/**
 * 訊かれたエリアのうち、`entries`（実際に返す候補）が1つも収録していないものを欠損にする。
 *
 * **「解決に使わなかったエリア」ではなく「返した候補が覆っていないエリア」で判定する。**
 * 前者にすると「上野・浅草」で浅草の欠損が付くが、台東区の8件はいずれも両方を収録しており
 * 実際には答えられている。ノイズを足さない（Issue #29 の AC）ためには実測で見る必要がある。
 */
export function uncoveredAreaGaps(
  asked: readonly RepresentativeArea[],
  answering: RepresentativeArea,
  entries: readonly CatalogEntry[],
): Gap[] {
  const covered = new Set<RepresentativeArea>(entries.flatMap((entry) => [...entry.areas]));
  return asked.filter((area) => !covered.has(area)).map((area) => uncoveredAreaUnanswered(area, answering));
}

/**
 * `areas`（構造化入力）で**目的地と明示された**対象エリア外を欠損にする（Issue #58／ADR-011）。
 *
 * 質問文から拾った対象エリア外の地名は部分欠損にしない（Issue #29 — 出発地と見分けられない）が、
 * `areas` に入れた地名は呼び出し側が目的地だと言っている。見分けの問題が無いので報告する。
 * 報告しないと「上野・新宿を回りたい」の新宿だけが応答から黙って消える。
 *
 * `area` に目的地の地名を入れるのは、この欠損が応答全体のエリアと必ず違うため（`Gap` の doc 参照。
 * 記録の `area` 列が応答全体の値に落ちると、どの地域のデータが求められたかの集計から消える）。
 *
 * 応答全体が `unanswered` になる経路でも、この欠損は**落とさず `gaps` として添える**
 * （[Issue #70](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/70)）。`unanswered` の
 * `reason` は1つしか運べないが、呼び出し側が構造化データで明示した目的地の欠損まで
 * 畳むと、「ラーメンには答えられない」の応答から「新宿を訊かれた」事実が消える。
 * 応答全体が `out_of_area` の場合は、理由が報告する地名（最初の1件）を除いた残りを添える。
 */
export const outOfAreaAskedGaps = (input: SearchDatasetsInput): Gap[] =>
  (input.areas ?? [])
    .filter((name) => !isRepresentativeArea(name))
    .map((name) => ({ ...outOfAreaUnanswered(name), area: name }));

/**
 * `unanswered` 応答で、目的地と明示された**代表エリア**のうち絞り込みに使わなかったもの
 * （Issue #70）。絞り込みに使ったエリアは記録の `area` 列（解決結果）に残るが、2件目以降は
 * これを添えないと応答・記録・`question` 列のどこにも残らない。
 *
 * `uncoveredAreaUnanswered`（「返した候補はいずれも〜」）は候補が存在しない文脈では嘘になる
 * ため使えない。実際に言えること（この応答がそのエリアについて答えていない）だけを書く。
 * `reason` は `other`（対象エリアなので `out_of_area` ではなく、データの不在を確かめた
 * わけでもない — `uncoveredAreaUnanswered` と同じ判断）。
 */
export const unansweredAskedAreaGap = (area: string): Gap => ({
  ...unanswered("other", `「${area}」についても訊かれましたが、この応答では答えられていません。`),
  area,
});

/**
 * 返した候補のキーワード表に、この興味の語が1つでも当たるか。判定は `scoreEntry` と同一
 * （キーワード表との部分一致だけで、興味の語を分解しない）。
 *
 * **部分一致ゆえの偽陰性がある**（欠損が出ない側に転ぶ）。興味「夜遊び」は銭湯のキーワード
 * 「夜」を含むため covered 扱いになり、取り落ちは報告されない — Issue #53 の症状と同じ形が
 * チップの文言次第で再発する。興味チップの語彙を決める側（フロントエンド）は、キーワード表の
 * 語（catalog.ts）を**含まない**ラベルほど判定が正確になることに留意。
 */
const interestCovered = (interest: string, entries: readonly CatalogEntry[]): boolean =>
  entries.some((entry) => scoreEntry(entry, interest) > 0);

/**
 * 訊かれた興味のうち、返した候補が覆っていないもの（Issue #53／ADR-011）。
 *
 * 「無い」と断定しない。実装が知っているのは「返した候補のキーワード表に当たらなかった」
 * だけで、答えになるデータの実在は判定していない（「ナイトライフ」に対して銭湯（営業〜0時）は
 * 10件の中に実在する）。`categoryMissUnanswered` と同じ判断で、実際に行ったことだけを書く。
 */
const interestMissUnanswered = (interest: string): Unanswered =>
  unanswered(
    "other",
    `「${interest}」について訊かれましたが、返した候補のキーワードには「${interest}」の語に当たるものがありませんでした。`,
  );

/**
 * `interests`（構造化入力）のうち、返した候補が覆っていないものを欠損にする（Issue #53／ADR-011）。
 *
 * 判定は「返した候補」に対して行う（Issue #52 の取り落ちと同じ理由 — 利用者が見るのは
 * 返した候補であって、照合の途中結果ではない）。
 *
 * **既知の欠損として実際に報告される興味だけを外す。** `collectPartialGaps` がより強い分類
 * （`insufficient_granularity` / `data_not_published`）で同じ欠損を報告済みの場合、ここで
 * 重ねると同じ興味が2件の欠損として画面と記録に載る。ただし外してよいのは**報告と対応が
 * 取れている興味だけ** —
 * - ジャンル指定の飲食: 報告されるのは `genre`（haystack で最初に見つかった1語）だけなので、
 *   **報告された語を含む興味だけ**を外す。`["ラーメン", "寿司"]` の寿司まで外すと、寿司の
 *   要求が応答からも記録からも消える（ジャンル語を含む興味でも、報告に対応しないものは
 *   `other` の取り落ちとして載せる。粒度不足と分類しきれないが、沈黙よりよい）
 * - マナー・渋谷の観光: 報告される欠損は特定の語に紐づかない総括（マナー全般・渋谷の
 *   観光データ全般）なので、該当する語を含む興味はすべてその1件が覆っている
 */
export function uncoveredInterestGaps(
  input: SearchDatasetsInput,
  area: ResolvedArea,
  genre: string | undefined,
  entries: readonly CatalogEntry[],
): Gap[] {
  return (input.interests ?? [])
    .filter((interest) => !interestCovered(interest, entries))
    .filter((interest) => !(genre && interest.includes(genre)))
    .filter((interest) => !findFirstTerm(interest, ETIQUETTE_TERMS))
    .filter(
      (interest) =>
        !(area.kind === "representative" && area.area === "渋谷" && findFirstTerm(interest, SHIBUYA_SIGHTSEEING_TERMS)),
    )
    .map(interestMissUnanswered);
}

type ResolvedArea =
  | { kind: "representative"; area: RepresentativeArea }
  | { kind: "out_of_area"; label: string }
  | { kind: "unspecified" };

/**
 * `areas`（構造化入力）→ `area` の明示指定 → 質問文からの推測、の順で決める。
 *
 * `areas` からは**最初の代表エリア**を絞り込みに使う（絞り込みは1エリアぶんしか行わない。
 * 質問文推測の「定義順の最初」と同じ制約で、こちらは呼び出し側の並び順を尊重する）。
 * 代表エリアが1つも無ければ、先頭を対象エリア外として返す。空配列は「目的地なし」なので
 * 質問文からの推測に**落とさない**（推測しないでほしいから空配列を送っている）。
 *
 * 質問文の中では代表エリアを対象外の地名より優先する（「新宿から上野へ行きたい」は答えられる）。
 */
export function resolveArea(input: SearchDatasetsInput): ResolvedArea {
  if (input.areas) {
    const representative = input.areas.find(isRepresentativeArea);
    if (representative) return { kind: "representative", area: representative };
    const [first] = input.areas;
    return first ? { kind: "out_of_area", label: first } : { kind: "unspecified" };
  }

  const explicit = input.area?.trim();
  if (explicit) {
    return isRepresentativeArea(explicit)
      ? { kind: "representative", area: explicit }
      : { kind: "out_of_area", label: explicit };
  }

  const fromQuery = findRepresentativeArea(input.query ?? "");
  if (fromQuery) return { kind: "representative", area: fromQuery };

  const nonTarget = findNonTargetArea(input.query ?? "");
  return nonTarget ? { kind: "out_of_area", label: nonTarget } : { kind: "unspecified" };
}

/**
 * `out_of_area` を型として受け付けない `ResolvedArea`。
 *
 * 分類ガードは対象エリア外の早期 return より後にあるため `out_of_area` は届かないが、
 * コメントだけの不変条件は分岐の並べ替えで黙って壊れる（壊れると対象エリア外の問いに
 * 「利用中の10データセットのキーワードには〜」という嘘の文が出る）。`answeredCandidates` が
 * `NonEmpty` で「候補ゼロの answered」を不可能にしているのと同じ型担保。
 */
type MatchedArea = Exclude<ResolvedArea, { kind: "out_of_area" }>;

/**
 * 分類を明示されたのに1件も当たらなかったとき（Issue #59）。
 *
 * **「利用中の10データセットに無い」と書かない。** 実装が知っているのは「照合した集合で
 * キーワード表に当たらなかった」だけで、10件が分類をカバーするかは判定していない。
 * エリアで絞り込んでいた場合は絞り込みの外に該当データが実在しうる（「上野の公園」に対して
 * 渋谷区の都市公園・都立公園一覧は10件の中に実在する）。`areaOnlyFallbackUnanswered` と
 * 同じ判断で、**実際に照合した集合と結果だけを書く**。
 *
 * 書き出しも「ありません」（存在の断定）ではなく「見つかりませんでした」（照合の結果）。
 * 断定してよいのは無いことを確かめた分岐（ジャンル粒度・エリア外・渋谷の観光データ）だけで、
 * ここはキーワード表に当たらなかっただけだから（API.md §4）。
 *
 * `unspecified` は全10件を照合しているが、それでも「対応するものが無い」とは書かない。
 * キーワードの照合に当たらないことと、分類に対応するデータが無いことは別だから
 * （語彙が違うだけかもしれない）。
 */
export const categoryMissUnanswered = (area: MatchedArea, category: string): Unanswered =>
  unanswered(
    "other",
    area.kind === "representative"
      ? `該当するオープンデータが見つかりませんでした。「${area.area}」で絞り込んだ候補には「${category}」の語に当たるデータセットがありませんでした。`
      : `該当するオープンデータが見つかりませんでした。利用中の10データセットのキーワードには「${category}」の語に当たるものがありませんでした。`,
  );

/** 質問文に現れたキーワードの数。多く当たったデータセットほど候補として上に出す。 */
export const scoreEntry = (entry: CatalogEntry, haystack: string): number =>
  entry.keywords.filter((keyword) => haystack.includes(keyword)).length +
  (haystack.includes(entry.title) ? 1 : 0);
/**
 * 質問文に混ざっている「答えられない側面」を集める。
 *
 * **自然文を興味に分解することはしない。** ここに挙がるのは、既存の未回答判定がすでに
 * 列挙している語彙だけで、変わるのは「他が当たっても報告するか」だけ。分解の規則を今
 * スタブに作り込むと、Step 5 で LLM が担う分解と二重になる（Issue #29）。
 *
 * **対象エリア外の地名（`NON_TARGET_AREAS`）は部分欠損にしない。** 「新宿のホテルから
 * 上野の美術館へ」の新宿は出発地であって、新宿のデータを求めてはいない。スタブには
 * 「新宿について訊かれた」と「新宿を経路として書いた」を見分ける手段が無く、
 * 報告すると答えられている応答にノイズを足すことになる（Issue #29 の AC「空配列や
 * ノイズを足さない」）。ここに残す3つは**求めているデータの種類**を指す語なので、
 * 散文中の言及と取り違えにくい。
 */
export function collectPartialGaps(area: ResolvedArea, genre: string | undefined, haystack: string): Gap[] {
  const gaps: Gap[] = [];

  // ジャンル指定の飲食が混ざっているとき、返す候補は飲食店データを除いたもの
  // （`usable` で除外済み）なので、ジャンルの問いは必ず未回答のまま残っている
  if (genre) gaps.push(cuisineGenreUnanswered(genre));

  // マナー・作法の問いが混ざっているとき、それに答えるデータは10件のどれにも無い
  // （カタログ全体に無いことを調査済み）ので、必ず未回答のまま残っている（Issue #43）
  if (findFirstTerm(haystack, ETIQUETTE_TERMS)) gaps.push(etiquetteUnanswered());

  if (area.kind === "representative" && area.area === "渋谷" && findFirstTerm(haystack, SHIBUYA_SIGHTSEEING_TERMS)) {
    gaps.push(shibuyaSightseeingUnanswered());
  }

  return gaps;
}