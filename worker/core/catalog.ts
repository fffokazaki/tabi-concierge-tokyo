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
 * - `sourceCells` は summary の根拠にした原本のセル値そのもの。
 *   `scripts/catalog-samples.test.ts` が「原本の行に実在し、かつ summary がその値を使っている」
 *   ことを両方向で検査する（名称だけの検査では summary の記述が原本から乖離しても気づけない）
 *
 * SSOT は docs/02-design/DATABASE.md §2。`scripts/lib/datasets.ts` にも同じ10件の宣言が
 * あるが、あちらは Node で動く取り込みツール専用の tsconfig プロジェクト
 * （`allowImportingTsExtensions`）に属するため worker からは読まず、必要な項目だけ写している。
 *
 * **このファイルは Node（scripts プロジェクトのテスト）からも読まれる。**
 * workerd 固有の import（`cloudflare:*` 等）を持ち込まないこと。
 *
 * ## Step 5 を終えた今の役割（2026-08-22 更新）
 *
 * かつてここには「Step 5 で D1 への実クエリに置き換える。そのとき `samples` は不要になり、
 * `areas` / `keywords` は検索の実装に吸収される」と書いてあったが、**そうはならなかった**。
 *
 * | 項目 | 今の役割 |
 * | --- | --- |
 * | `samples` | **縮退経路が使い続ける。** LLM や D1 が落ちたとき `extractFromSamples`（`operations.ts`）が返すのはこの固定データで、Step 5 以前と同じ応答になることがその価値である。消すと縮退先が無くなる |
 * | `keywords` | `search_datasets` のキーワード実装が使う。LLM は自然文を分解するだけで、候補のマッチ自体は今もキーワード表が行う（[Issue #120](https://github.com/fffokazaki/tabi-concierge-tokyo/issues/120)） |
 * | `areas` | 同上に加え、Text-to-SQL のプロンプトへ「このデータセットに実在するエリア」として渡す |
 * | `matchReason` | 応答の `matchReason` にそのまま出る。**LLM には書かせない**（実測の裏が無い文をユーザーに出さないため） |
 *
 * つまりこのファイルは「Step 5 までの仮置き」ではなく、**LLM 経路の足場と縮退先を兼ねる常設のデータ**である。
 */

/** 固定データとして返せる、実在する1行。 */
export type CatalogSample = {
  /** この行が属する代表エリア。集計意図のエリアと突き合わせる */
  readonly area: RepresentativeArea;
  /** 原本の名称列の値をそのまま使う */
  readonly name: string;
  /**
   * 原本の他の列（所在地・営業時間など）から組み立てた説明。
   * 原本に無い情報を足さないだけでなく、**原本にある留保（「公演等で変化あり」等）も落とさない**。
   * 区名のように出典から自明な補足のみ許す。
   */
  readonly summary: string;
  /** summary の根拠にした原本のセル値。原本の行にこの値がそのまま存在すること */
  readonly sourceCells: readonly string[];
  /** 原本CSVの行番号（1始まり・ヘッダを除く）。出典を行単位で辿れるようにする */
  readonly sourceRow: number;
};

export type CatalogEntry = {
  /** DATABASE.md §2 の No. */
  readonly no: number;
  readonly datasetId: string;
  readonly title: string;
  readonly provider: string;
  /**
   * 全10件 CC BY 4.0（カタログAPIで個別確認済み）。リテラル型にしてあるので、
   * 別ライセンスのデータセットを足そうとすると型エラーになる（CLAUDE.md 絶対ルール #4）。
   */
  readonly license: "CC BY 4.0";
  readonly url: string;
  readonly retrievedAt: string;
  /** 原本の行数（ヘッダを除く） */
  readonly rowCount: number;
  /** 実データに行が存在する代表エリア。統計表のようにエリアを持たないものは空 */
  readonly areas: readonly RepresentativeArea[];
  /** 検索語との突き合わせ用。スタブの簡易マッチのための語彙で、原本の列名ではない */
  readonly keywords: readonly string[];
  /**
   * 候補として返すときの適合理由。件数・収録内容・列の有無といった**実測できる事実**を書き、
   * 役割を一言添えるまでに留める。実測で裏の取れない断定はしない（応答としてユーザーに出る値）。
   */
  readonly matchReason: string;
  /** 集計で返せる実在の行。`areas` の各エリアにつき1件以上持つ（統計表のみ空） */
  readonly samples: readonly CatalogSample[];
};

const CATALOG_BASE = "https://catalog.data.metro.tokyo.lg.jp/dataset";

/**
 * 飲食店の店舗データはこの1件のみ。**ジャンルの列を持たない**（22列を実測）ため、
 * ジャンル指定の問いは「データ未公開」ではなく「粒度不足」として返す。
 * ID を直接書くと、差し替え時にガードが黙って効かなくなるのでここに集約する
 * （`scripts/catalog-samples.test.ts` が、この ID がカタログに実在することを検査している）。
 */
export const RESTAURANT_DATASET_ID = "t000012d0000000063";

/** クロス集計表。施設行を持たないため、個別の地物を抽出できない（DATABASE.md の has_spots=0） */
export const STATISTICS_DATASET_ID = "t000012d0000000081";

export const CATALOG: readonly CatalogEntry[] = [
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
        sourceCells: ["上野桜木1丁目14番"],
        sourceRow: 3,
      },
      {
        area: "浅草",
        name: "浅草寺",
        summary: "所在地は台東区浅草2-3-1。同じ所在地の行として浅草神社も収録されている。",
        sourceCells: ["浅草2-3-1"],
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
        summary: "所在地は上野公園7番7号、電話番号は03-5777-8600。台東区の文化観光施設一覧に美術館として収録。",
        sourceCells: ["上野公園7番7号", "03-5777-8600"],
        sourceRow: 4,
      },
      {
        area: "浅草",
        name: "浅草文化観光センター",
        summary: "所在地は雷門2丁目18番9号、電話番号は03-3842-5566。台東区の文化観光施設一覧に観光として収録。",
        sourceCells: ["雷門2丁目18番9号", "03-3842-5566"],
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
          "寛永寺が所有する区指定文化財（美術工芸品）。所在地は東京都台東区上野桜木1丁目、文化財指定日は1988-03-31。",
        sourceCells: ["区指定文化財", "美術工芸品", "寛永寺", "東京都台東区上野桜木1丁目", "1988-03-31"],
        sourceRow: 1,
      },
      {
        area: "浅草",
        name: "絹本著色親鸞上人絵伝",
        summary:
          "東本願寺が所有する区民文化財（美術工芸品）。所在地は東京都台東区西浅草1丁目、文化財指定日は1989-02-20。",
        sourceCells: ["区民文化財", "美術工芸品", "東本願寺", "東京都台東区西浅草1丁目", "1989-02-20"],
        sourceRow: 6,
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
        sourceCells: ["東京都台東区上野公園10-17前", "２４時間利用可能"],
        sourceRow: 1,
      },
      {
        area: "浅草",
        name: "下水ポンプ場脇",
        summary: "所在地は東京都台東区浅草5-73-11。２４時間利用可能で、乳幼児用設備の設置あり。",
        sourceCells: ["東京都台東区浅草5-73-11", "２４時間利用可能"],
        sourceRow: 15,
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
        summary: "大分類は「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所。座標つきで収録。",
        sourceCells: ["「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所"],
        sourceRow: 10,
      },
      {
        area: "浅草",
        name: "東西(鶯谷駅経由・日医大回りルート)27西浅草三丁目",
        summary: "大分類は「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所。座標つきで収録。",
        sourceCells: ["「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所"],
        sourceRow: 20,
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
        summary: "住所は東京都台東区上野3-14-5。営業は6:00から20:00、定休日は月・火、入浴料金（基本）は500円。",
        sourceCells: ["東京都台東区上野3-14-5", "6:00", "20:00", "月・火", "500"],
        sourceRow: 10,
      },
      {
        area: "浅草",
        name: "アクアプレイス旭",
        summary: "住所は東京都台東区浅草5-10-5。営業は15:00から0:00、定休日は火、入浴料金（基本）は500円。",
        sourceCells: ["東京都台東区浅草5-10-5", "15:00", "0:00", "火", "500"],
        sourceRow: 1,
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
        summary: "所在地は浅草一丁目1番15号。営業形態は旅館・ホテル営業、許可番号は30台台健生環き第109号。",
        sourceCells: ["浅草一丁目1番15号", "旅館・ホテル営業", "30台台健生環き第109号"],
        sourceRow: 4,
      },
      {
        area: "上野",
        name: "ﾎﾃﾙ ﾕﾅｲﾃｯﾄﾞ",
        summary: "所在地は池之端一丁目1番4号。営業形態は旅館・ホテル営業、許可番号は63台下健衛環き第1号。",
        sourceCells: ["池之端一丁目1番4号", "旅館・ホテル営業", "63台下健衛環き第1号"],
        sourceRow: 163,
      },
    ],
  },
  {
    no: 8,
    datasetId: RESTAURANT_DATASET_ID,
    title: "東京都内の飲食店のバリアフリー情報",
    provider: "東京都産業労働局",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/${RESTAURANT_DATASET_ID}`,
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
          "住所は東京都台東区上野公園5-45 東京文化会館内。営業時間は11:00~17:00 (LO16:30)または11:00~19:00(LO18:30) 文化会館の公演等で変化あり。車椅子での移動が可能で、英語等外国語のメニューあり。",
        sourceCells: [
          "東京都台東区上野公園5-45 東京文化会館内",
          "11:00~17:00 (LO16:30)または11:00~19:00(LO18:30) 文化会館の公演等で変化あり",
        ],
        sourceRow: 66,
      },
      {
        area: "浅草",
        name: "一頭買焼肉 玄 浅草本店",
        summary:
          "住所は東京都台東区浅草1-42-4 ヒューリック浅草一丁目ビル 2F。営業時間はランチ11:45~15:00(LO14:30)ディナー16:30~22:15(LO21:45)土・日・祝16:30~21:50(LO21:15)。車椅子での移動が可能で、英語等外国語のメニューあり。",
        sourceCells: [
          "東京都台東区浅草1-42-4 ヒューリック浅草一丁目ビル 2F",
          "ランチ11:45~15:00(LO14:30)ディナー16:30~22:15(LO21:45)土・日・祝16:30~21:50(LO21:15)",
        ],
        sourceRow: 71,
      },
    ],
  },
  {
    no: 9,
    datasetId: STATISTICS_DATASET_ID,
    title: "R6国・地域別外国人旅行者行動特性調査",
    provider: "東京都産業労働局",
    license: "CC BY 4.0",
    url: `${CATALOG_BASE}/${STATISTICS_DATASET_ID}`,
    retrievedAt: "2026-08-16",
    rowCount: 22,
    // 国・地域×性別のクロス集計表。施設行を持たないためエリアで絞り込めない
    areas: [],
    keywords: ["統計", "訪日", "外国人", "旅行者", "調査", "行動"],
    // タイトルは「行動特性調査」だが、このスナップショットの実体は性別構成比の集計表。
    // 実測できる中身だけを書く（タイトルから連想した用途を書かない）
    matchReason: "国・地域別の回答者構成（男性・女性・無回答・合計・標本数）を集計した22行のクロス集計表。施設一覧ではない",
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
    // エリア名（渋谷）はキーワードに入れない。入れると「渋谷の美術館」のような
    // 内容の合わない質問にも当たってしまい、渋谷の観光データ欠損が見えなくなる
    keywords: ["公園", "自然", "緑", "散策", "屋外"],
    matchReason: "渋谷区の都市公園・都立公園123件。座標つきで、渋谷エリアの屋外スポットの根拠になる",
    samples: [
      {
        area: "渋谷",
        name: "恵比寿東公園",
        summary: "所在地は渋谷区恵比寿1-2-16。渋谷区が公開する都市公園・都立公園一覧123件のうちの1件。",
        sourceCells: ["渋谷区恵比寿1-2-16"],
        sourceRow: 1,
      },
    ],
  },
];

export const findEntry = (datasetId: string): CatalogEntry | undefined =>
  CATALOG.find((entry) => entry.datasetId === datasetId);
