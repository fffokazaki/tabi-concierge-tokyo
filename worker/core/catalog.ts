import type { RepresentativeArea } from "../../shared/core";

/**
 * 確定10件のカタログメタと、スタブが返す固定データ。
 *
 * **ここに書いてある値はすべて実測値**（CLAUDE.md「推測で埋めない」）。
 * - メタ情報（ID・タイトル・提供元・URL・取得日・件数）は `data/<id>/meta.json` の写し
 * - `areas` は取り込み済みの D1（`spots.area`）で行が存在することを確認したエリアのみ
 * - `samples` の名称・説明は `data/<id>/data.csv` に**実在する行**から採り、`sourceRow` に
 *   ヘッダを除く行番号（1始まり）を記録している。存在しない施設名を書くことは、
 *   実在するデータセットIDを出典に付ける以上、出典の偽造にあたる
 *
 * SSOT は docs/02-design/DATABASE.md §2。`scripts/lib/datasets.ts` にも同じ10件の宣言が
 * あるが、あちらは Node で動く取り込みツール専用の tsconfig プロジェクト
 * （`allowImportingTsExtensions`）に属するため worker からは読まず、必要な項目だけ写している。
 *
 * Step 5 で D1 への実クエリ（メタデータRAG / Text-to-SQL）に置き換える。そのとき
 * `samples` は不要になり、`areas` / `keywords` は検索の実装に吸収される。
 */

/** 固定データとして返せる、実在する1行。 */
export type CatalogSample = {
  /** この行が属する代表エリア。集計意図にエリア名が含まれるときの選択に使う */
  area: RepresentativeArea;
  /** 原本の名称列の値をそのまま使う */
  name: string;
  /** 原本の他の列（所在地・営業時間など）から組み立てた説明。原本に無い情報は足さない */
  summary: string;
  /** 原本CSVの行番号（1始まり・ヘッダを除く）。出典を行単位で辿れるようにする */
  sourceRow: number;
};

export type CatalogEntry = {
  /** DATABASE.md §2 の No. */
  no: number;
  datasetId: string;
  title: string;
  provider: string;
  /**
   * 全10件 CC BY 4.0（カタログAPIで個別確認済み）。リテラル型にしてあるので、
   * 別ライセンスのデータセットを足そうとすると型エラーになる（CLAUDE.md 絶対ルール #4）。
   */
  license: "CC BY 4.0";
  url: string;
  retrievedAt: string;
  /** 原本の行数 */
  rowCount: number;
  /** 実データに行が存在する代表エリア。統計表のようにエリアを持たないものは空 */
  areas: RepresentativeArea[];
  /** 検索語との突き合わせ用。スタブの簡易マッチのための語彙で、原本の列名ではない */
  keywords: string[];
  /** 候補として返すときの適合理由。データセットの実測値だけで構成する */
  matchReason: string;
  /** 集計で返せる実在の行。統計表（クロス集計）は施設行を持たないため空 */
  samples: CatalogSample[];
};

const CATALOG_BASE = "https://catalog.data.metro.tokyo.lg.jp/dataset";

export const CATALOG: CatalogEntry[] = [
  {
    no: 1,
    datasetId: "t131067d0000000251",
    title: "名所・史跡",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000251`,
    retrievedAt: "2026-08-16",
    rowCount: 45,
    areas: ["上野", "浅草"],
    keywords: ["名所", "史跡", "寺", "寺社", "神社", "観光", "文化", "歴史", "浅草寺", "寛永寺"],
    matchReason: "台東区の名所・史跡45件。上野・浅草の寺社（寛永寺・浅草寺・浅草神社）を含む",
    samples: [
      {
        area: "上野",
        name: "寛永寺",
        summary: "所在地は台東区上野桜木1丁目14番。台東区が名所・史跡として公開している45件のうちの1件。",
        sourceRow: 3,
      },
      {
        area: "浅草",
        name: "浅草寺",
        summary: "所在地は台東区浅草2-3-1。同じ住所に浅草神社・伝法院も収録されている。",
        sourceRow: 27,
      },
    ],
  },
  {
    no: 2,
    datasetId: "t131067d0000000236",
    title: "文化観光施設",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000236`,
    retrievedAt: "2026-08-16",
    rowCount: 30,
    areas: ["上野", "浅草"],
    keywords: ["文化", "観光", "美術館", "博物館", "施設", "展示", "アート"],
    matchReason:
      "台東区の文化観光施設30件。上野の美術館・博物館（国立西洋美術館・東京都美術館・国立科学博物館）と浅草文化観光センターを含む",
    samples: [
      {
        area: "上野",
        name: "国立西洋美術館",
        summary: "所在地は上野公園7番7号、電話 03-5777-8600。台東区の文化観光施設一覧に美術館として収録。",
        sourceRow: 4,
      },
      {
        area: "浅草",
        name: "浅草文化観光センター",
        summary: "所在地は雷門2丁目18番9号、電話 03-3842-5566。台東区の文化観光施設一覧に観光として収録。",
        sourceRow: 3,
      },
    ],
  },
  {
    no: 3,
    datasetId: "t131067d0000000393",
    title: "文化財一覧",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000393`,
    retrievedAt: "2026-08-16",
    rowCount: 190,
    areas: ["上野", "浅草"],
    keywords: ["文化財", "指定文化財", "歴史", "文化", "美術"],
    matchReason: "台東区の指定文化財190件。所有者・指定日・分類つきで、名所・史跡の説明を裏づける",
    samples: [
      {
        area: "上野",
        name: "絹本著色元三大師画像",
        summary:
          "寛永寺が所有する区指定文化財（美術工芸品・1幅）。所在地は東京都台東区上野桜木1丁目、文化財指定日は1988-03-31。",
        sourceRow: 1,
      },
    ],
  },
  {
    no: 4,
    datasetId: "t131067d0000000249",
    title: "トイレ情報",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000249`,
    retrievedAt: "2026-08-16",
    rowCount: 69,
    areas: ["上野", "浅草"],
    keywords: ["トイレ", "手洗い", "設備", "子連れ", "ベビー", "家族", "バリアフリー"],
    matchReason: "台東区の公衆トイレ69件。利用可能時間・乳幼児用設備の有無を含み、旅程の実行可能性を確認できる",
    samples: [
      {
        area: "上野",
        name: "上野公園大黒天横",
        summary: "所在地は東京都台東区上野公園10-17前。２４時間利用可能で、乳幼児用設備の設置あり。",
        sourceRow: 1,
      },
    ],
  },
  {
    no: 5,
    datasetId: "t131067d0000000247",
    title: "めぐりん停留所（東西めぐりん）",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000247`,
    retrievedAt: "2026-08-16",
    rowCount: 72,
    areas: ["上野", "浅草"],
    keywords: ["バス", "交通", "移動", "停留所", "めぐりん", "アクセス"],
    matchReason: "台東区循環バス「東西めぐりん」の停留所72件。上野・浅草間の移動手段の根拠になる",
    samples: [
      {
        area: "上野",
        name: "東西(鶯谷駅経由・日医大回りルート)2上野駅入谷口",
        summary: "東西めぐりん（鶯谷駅経由・日医大回りルート）の停留所。座標つきで収録。",
        sourceRow: 10,
      },
    ],
  },
  {
    no: 6,
    datasetId: "t131067d0000000256",
    title: "銭湯",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d0000000256`,
    retrievedAt: "2026-08-16",
    rowCount: 23,
    areas: ["上野", "浅草"],
    keywords: ["銭湯", "風呂", "温浴", "文化", "体験", "夜"],
    matchReason: "台東区の銭湯23件。営業時間・定休日・入浴料金つきで、時間帯を伴う旅程に組める",
    samples: [
      {
        area: "上野",
        name: "燕湯",
        summary: "東京都台東区上野3-14-5。営業は6:00〜20:00、定休日は月・火。入浴料金は大人500円。",
        sourceRow: 10,
      },
    ],
  },
  {
    no: 7,
    datasetId: "t131067d2025000004",
    title: "宿泊施設（旅館台帳）",
    provider: "台東区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131067d2025000004`,
    retrievedAt: "2026-08-16",
    rowCount: 883,
    areas: ["上野", "浅草"],
    keywords: ["宿", "宿泊", "ホテル", "旅館", "泊まる"],
    matchReason: "台東区の旅館業許可施設883件。営業形態・許可番号・座標つき",
    samples: [
      {
        area: "浅草",
        name: "浅草東武ﾎﾃﾙ",
        summary: "所在地は浅草一丁目1番15号。営業形態は旅館・ホテル営業（許可番号 30台台健生環き第109号）。",
        sourceRow: 4,
      },
    ],
  },
  {
    no: 8,
    datasetId: "t000012d0000000063",
    title: "東京都内の飲食店のバリアフリー情報",
    provider: "東京都産業労働局",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t000012d0000000063`,
    retrievedAt: "2026-08-16",
    rowCount: 210,
    areas: ["上野", "浅草"],
    keywords: ["飲食", "レストラン", "食事", "グルメ", "バリアフリー", "車椅子"],
    matchReason:
      "都内の飲食店210件。ただしバリアフリー対応店に限定された部分集合で、台東区の収録は19件。ジャンルの列は持たない",
    samples: [
      {
        area: "上野",
        name: "フォレスティーユ精養軒",
        summary:
          "東京都台東区上野公園5-45 東京文化会館内。営業時間は11:00~17:00 (LO16:30)または11:00~19:00(LO18:30)。車椅子での移動が可能で、英語等外国語のメニューあり。",
        sourceRow: 66,
      },
    ],
  },
  {
    no: 9,
    datasetId: "t000012d0000000081",
    title: "R6国・地域別外国人旅行者行動特性調査",
    provider: "東京都産業労働局",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t000012d0000000081`,
    retrievedAt: "2026-08-16",
    rowCount: 22,
    // 性別×国・地域のクロス集計表。施設行を持たないためエリアで絞り込めない
    areas: [],
    keywords: ["統計", "訪日", "外国人", "旅行者", "調査", "行動"],
    matchReason: "訪日旅行者の行動特性（22行のクロス集計表）。施設一覧ではなく統計値で、多言語対応の根拠になる",
    // 施設行が無いため集計で返せる行が無い（DATABASE.md の has_spots=0 と対応）
    samples: [],
  },
  {
    no: 10,
    datasetId: "t131130d2025000003",
    title: "都市公園・都立公園一覧",
    provider: "渋谷区",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/t131130d2025000003`,
    retrievedAt: "2026-08-16",
    rowCount: 123,
    areas: ["渋谷"],
    keywords: ["公園", "自然", "緑", "散策", "屋外", "渋谷"],
    matchReason: "渋谷区の都市公園・都立公園123件。座標つきで、渋谷エリアの屋外スポットの根拠になる",
    samples: [
      {
        area: "渋谷",
        name: "恵比寿東公園",
        summary: "所在地は渋谷区恵比寿1-2-16。渋谷区が公開する都市公園・都立公園一覧123件のうちの1件。",
        sourceRow: 1,
      },
    ],
  },
];

export const findEntry = (datasetId: string): CatalogEntry | undefined =>
  CATALOG.find((entry) => entry.datasetId === datasetId);
