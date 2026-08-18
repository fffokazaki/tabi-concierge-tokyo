/**
 * 住所（町字）→ 代表エリアの対応表。
 *
 * ## なぜ対応表が要るのか
 *
 * 10件のオープンデータに「エリア」列は存在しない。一方 API_REQUIREMENTS.md は
 * `search_datasets({ area: "上野" })` を要求しているため、エリアは取り込み時に
 * 確定させて列に持つ必要がある（実行時の部分一致では下記のとおり破綻する）。
 *
 * ## 部分一致が使えない理由（実データで確認済み・2026-08-16）
 *
 * | 住所 | `LIKE '%浅草%'` | 正しい判定 |
 * | --- | --- | --- |
 * | 雷門2丁目18番9号（浅草文化観光センター） | ✗ 拾えない | 浅草 |
 * | 浅草橋1丁目〜（14件） | ✓ 拾ってしまう | 対象外（浅草寺から約2km南） |
 * | 元浅草2丁目〜（11件） | ✓ 拾ってしまう | 対象外（新御徒町付近） |
 *
 * つまり部分一致は「浅草の代表施設を落として、浅草でない25件を混ぜる」。
 *
 * ## この対応表は「記録された判断」であってデータではない
 *
 * どの町字までを観光上の「浅草」と呼ぶかはデータから導出できない（CLAUDE.md
 * 「推測で埋めない」）。ここでは次の基準で線を引いた。異論があれば変えてよいが、
 * 変えるときは基準ごと更新すること。
 *
 * - **浅草**: 浅草寺・雷門を中心とした徒歩圏で、浅草通りより北側の町字
 *   （浅草通り以南の 駒形・寿・蔵前 は「蔵前・駒形」として別エリア扱いにし、含めない）
 * - **上野**: 上野駅・上野公園を中心とした徒歩圏。不忍池西岸の池之端まで含める
 * - 台東区のそれ以外（谷中・根岸・浅草橋 等）は代表エリア外として `null`
 * - 渋谷区のデータは区単位で1件のみのため、町字を見ずに固定（datasets.ts の `fixedArea`）
 *
 * 台東区データに実在する33種の町字をすべて分類済み。未知の町字は `null` になる。
 */

export const AREA_ASAKUSA = "浅草";
export const AREA_UENO = "上野";
export const AREA_SHIBUYA = "渋谷";

/** 町字 → エリア。キーは完全一致で引く（前方一致にすると浅草橋・元浅草を巻き込む） */
const TOWN_TO_AREA: Record<string, string> = {
  // --- 浅草エリア ---
  浅草: AREA_ASAKUSA,
  雷門: AREA_ASAKUSA, // 浅草文化観光センター・雷門
  花川戸: AREA_ASAKUSA, // 吾妻橋・隅田公園側
  西浅草: AREA_ASAKUSA, // 合羽橋寄り
  東浅草: AREA_ASAKUSA,
  千束: AREA_ASAKUSA, // 観音裏・鷲神社
  今戸: AREA_ASAKUSA, // 今戸神社。隅田川沿い、浅草寺から徒歩圏

  // --- 上野エリア ---
  上野: AREA_UENO,
  上野公園: AREA_UENO, // 国立西洋美術館・東京都美術館・国立科学博物館
  上野桜木: AREA_UENO, // 寛永寺
  東上野: AREA_UENO,
  北上野: AREA_UENO,
  池之端: AREA_UENO, // 不忍池西岸
};

/**
 * 「浅草」「上野」を含むが、その代表エリアではない町字。
 * 名称からエリアを引くとき（resolveAreaFromName）に、部分一致より先に弾く。
 * 台東区データに実在する33種の町字を確認して洗い出したもの（2026-08-16）。
 */
const AMBIGUOUS_TOWNS = ["浅草橋", "元浅草"];

/**
 * 住所文字列から町字を切り出す。
 * 例: "東京都台東区上野桜木1丁目14番" → "上野桜木" / "蔵前4丁目36番7号（竜宝寺内）" → "蔵前"
 *
 * 丁目の表記は同じ台東区でもデータセットによって揺れる。
 * 算用数字（"浅草7丁目"・名所史跡）と漢数字（"浅草一丁目"・宿泊施設）の両方が実在するため、
 * どちらも町字の切れ目として扱う。漢数字を見落とすと "浅草一丁目" が町字になり、
 * 完全一致のマッピングから外れて 883 件が丸ごと未分類になる。
 */
export function extractTown(address: string): string {
  if (!address) return "";
  let a = address.trim();
  a = a.replace(/^東京都/, "");
  a = a.replace(/^(台東区|渋谷区|[^\s]{1,5}区)/, "");
  // 漢数字の丁目（"一丁目"〜"十九丁目"）を先に落とす。
  // ※ 町字そのものに漢数字を含む "三ノ輪" 等を壊さないよう、「丁目」が続く場合のみ
  a = a.replace(/[一二三四五六七八九十]+丁目.*$/, "");
  // 算用数字（半角・全角）より前が町字
  const m = a.match(/^([^0-9０-９]+)/);
  const town = (m ? m[1] : a).replace(/[（(].*$/, "").trim();
  return town;
}

/**
 * 住所から代表エリアを判定する。代表エリア外・判定不能は null。
 * `fixedArea` が指定されていればそれを優先する（渋谷区データ）。
 */
export function resolveArea(address: string, fixedArea?: string): string | null {
  if (fixedArea) return fixedArea;
  const town = extractTown(address);
  return TOWN_TO_AREA[town] ?? null;
}

/**
 * 名称に含まれる括弧書きを落とす。半角・全角のどちらも実在する
 * （路線名は半角 "東西(上野公園経由・三崎坂往復ルート)"、補足は全角 "三筋二丁目（台東デザイナーズビレッジ）"）。
 *
 * 開きと閉じが対応していない名称は、壊れた範囲を推測して削らずそのまま返す
 * （どこまでが括弧書きか決められないため。CLAUDE.md「推測で埋めない」）。
 */
const stripParenthesized = (name: string): string => name.replace(/[（(][^）)]*[）)]/g, "");

/**
 * 施設名・停留所名からエリアを判定する。住所列を持たないデータセット専用。
 *
 * めぐりん停留所（東西めぐりん・72件）は所在地列が空で、地名は名称にしか無い
 * （例 "東西(鶯谷駅経由・日医大回りルート)27西浅草三丁目"）。住所が無い以上、
 * 完全一致は使えないため部分一致で引くが、そのままでは2つの誤りを踏む。
 *
 * 1. **括弧の中は経由地であって、その停留所の所在地ではない。**
 *    "東西(上野公園経由・三崎坂往復ルート)27西浅草三丁目" は路線名側の「上野公園」が先に
 *    当たり、この路線の全38停留所が上野に倒れていた（Issue #30）。照合の前に括弧書きを落とす。
 * 2. そのままでは浅草橋・元浅草を巻き込む。曖昧な町字を弾いたうえで、残りを
 *    **長い町字から順に**照合する（"西浅草" を "浅草" より先に見ないと、西浅草が浅草として素通りする）。
 *
 * 曖昧な町字の判定も括弧を落とした**後**に行う。名称の側が浅草橋でなくても、路線名に
 * 浅草橋を含むだけで判定不能にしてしまうため（東西めぐりんの72件では 0 件だが、
 * 他路線を足したときに黙って停留所を落とす）。
 */
export function resolveAreaFromName(name: string): string | null {
  if (!name) return null;
  const stopName = stripParenthesized(name);
  if (!stopName) return null;
  if (AMBIGUOUS_TOWNS.some((t) => stopName.includes(t))) return null;
  const towns = Object.keys(TOWN_TO_AREA).sort((a, b) => b.length - a.length);
  for (const town of towns) {
    if (stopName.includes(town)) return TOWN_TO_AREA[town];
  }
  return null;
}

/** テスト・検証用。分類済みの町字一覧 */
export const KNOWN_TOWNS = Object.keys(TOWN_TO_AREA);

/**
 * エリア継承の根拠。住所つきデータセットで分類済みの施設1件を指す。
 * `datasetTitle` と `sourceRow` で「どのデータセットのどの行から継承したか」を辿れる形にする
 * （Issue #36 の AC。根拠がオープンデータ側にあることがこの継承の成立条件）。
 */
export interface FacilityAreaSource {
  name: string;
  area: string;
  datasetTitle: string;
  /** ヘッダを除いたデータ行の番号（worker/core/operations.ts の `describeQuery` と同じ数え方） */
  sourceRow: number;
}

/**
 * 町字を含まない停留所名が、住所つきデータセットで分類済みの施設名で**終わる**なら、
 * その施設のエリアを継承する（Issue #36）。
 *
 * めぐりん停留所は所在地列が全件空で、名称が施設名だけのもの（「東西(...)5寛永寺」）は
 * `resolveAreaFromName` では判定できない。施設名を町字マッピングへ手で足すのは推測で
 * 埋めることになる（CLAUDE.md 絶対ルール #1）。ここでは「停留所名に現れる施設名との
 * 共起を、その停留所の所在の根拠として採る」**という判断を記録した上で**、住所を持つ
 * データセットに実在する施設名とだけ突き合わせる — 町字マッピング（このファイル冒頭）と
 * 同じく、判断は記録し、根拠はオープンデータ側に置く。
 *
 * - **末尾一致（endsWith）のみ。** 停留所名は「路線(括弧)＋番号＋施設名」の形なので、
 *   実在の対応はすべて末尾一致で捕捉できる。包含（includes）まで緩めると、索引に
 *   「上野駅」だけがある状態で「上野駅入谷口」に当たる類の偶然一致が起きる
 *   （Issue #36 の検討点そのもの）
 * - 括弧除去後に開き括弧・閉じ括弧が残る名称は**継承しない**。対応の取れない括弧は
 *   `stripParenthesized` が削らずに返すため、路線名側の施設名が照合対象に残ってしまう
 * - 複数の施設名が当たったら**最長一致**を採る（「奏楽堂」と「旧東京音楽学校奏楽堂」が
 *   両方当たるなら長いほうが停留所名の意図に近い）
 * - 最長どうしでエリアが食い違ったら **null**（どちらか決められないものを推測で
 *   選ばない）。同名・同エリアが複数データセットにあれば**索引の並び順の先頭**を根拠に
 *   採る — 呼び出し側（seed.ts）は索引を `DATASETS` の定義順（No.1 名所・史跡 が先）で
 *   渡す契約。この順序が変わると DATABASE.md §2 の根拠表も追随が要る
 * - 施設名側の括弧は落とさない。「下町風俗資料館付設展示場（旧吉田屋酒店）」の別称を
 *   独立の索引項目にすると偶然の一致の面が広がるため、取りこぼす側（安全側）に倒す
 *
 * 適用は `resolveAreaFromName` が null を返した後段に限る。町字で判定できる停留所に
 * まで施設照合を挟むと、判定の根拠が「町字か施設か」で行ごとに揺れる。なお
 * `AMBIGUOUS_TOWNS`（浅草橋・元浅草）で null になった停留所も継承へ流れる — 現データで
 * 施設名が末尾一致する例は無いが、他路線を足すときは「曖昧な町字＋施設名」の停留所が
 * 町字の判断（代表エリア外）と矛盾しないかを確認すること。
 */
export function inheritAreaFromFacility(
  stopName: string,
  facilities: readonly FacilityAreaSource[],
): FacilityAreaSource | null {
  if (!stopName) return null;
  const stripped = stripParenthesized(stopName);
  if (/[（(）)]/.test(stripped)) return null;
  const matches = facilities.filter((f) => f.name && stripped.endsWith(f.name));
  if (matches.length === 0) return null;
  const longest = Math.max(...matches.map((m) => m.name.length));
  const best = matches.filter((m) => m.name.length === longest);
  const areas = new Set(best.map((m) => m.area));
  if (areas.size > 1) return null;
  return best[0];
}
