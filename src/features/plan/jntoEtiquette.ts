/**
 * マナーの「参考情報」（JNTO・日本政府観光局／`japan.travel`）（ADR-012）。
 *
 * **これは出典ではない。** `ProvenanceSource`（CC BY 4.0 のカタログ出典）とは型もラベルも
 * 意図的に分ける。JNTO は東京都オープンデータカタログとは無関係な外部サイトで、この参考情報が
 * 埋めるのは「マナー欄」だけ — 停留地名・所在地など回答の事実データには使わない
 * （CLAUDE.md 絶対ルール #4 の例外・ADR-012 参照）。
 *
 * 要約文は 2026-08-20 時点で実際の JNTO ページ（下記 URL）の内容に基づいて人手で作成した
 * ものであり、推測で書き足していない（絶対ルール #1 と同じ精神）。JNTO 側のページ内容が
 * 変わった場合、本ファイルは自動追従しない（ADR-012「影響」参照。人手更新が必要）。
 */

export type JntoReference = {
  /** JNTO ページの要約（1〜2文）。 */
  summary: string;
  /** 参照元 JNTO ページの URL。 */
  url: string;
};

/**
 * カテゴリ別の JNTO 参考情報。5カテゴリ固定（増減する場合はこのオブジェクトと
 * 下記 `CATEGORY_BY_DATASET_ID` の両方を更新する）。
 */
const JNTO_REFERENCES = {
  shrineTemple: {
    summary:
      "鳥居や山門をくぐる前に一礼し、参道の中央は避けて端を歩きます。手水舎があれば、お参りの前に手と口を清めましょう。",
    url: "https://www.japan.travel/en/guide/shrine-and-temple-traditions/",
  },
  bathhouse: {
    summary: "浴槽に入る前に、洗い場で体をしっかり洗い流します。タオルや石鹸を湯船の中に持ち込まないようにしましょう。",
    url: "https://www.japan.travel/en/guide/bathing-manners-and-tips/",
  },
  restaurant: {
    summary:
      "食事の前後に「いただきます」「ごちそうさまでした」と言うのが習慣です。残さず食べることが基本的なマナーとされています。",
    url: "https://www.japan.travel/en/guide/understanding-and-mastering-japanese-manners-and-etiquette/",
  },
  transitPark: {
    summary: "電車やバスの中では通話を控え、携帯はマナーモードに。優先席は必要な方に譲りましょう。",
    url: "https://www.japan.travel/en/plan/custom-manners/",
  },
  general: {
    summary: "公共の場では周囲への配慮が重視されます。ゴミは持ち帰り、静かに過ごすことが基本的なマナーです。",
    url: "https://www.japan.travel/en/guide/japanese-manners-dos-and-donts/",
  },
} as const satisfies Record<string, JntoReference>;

type JntoCategory = keyof typeof JNTO_REFERENCES;

/**
 * `datasetId → JNTOカテゴリ` の対応（`worker/core/catalog.ts` の実測値で確認済み）。
 *
 * キーは表示タイトルではなく `datasetId`（安定した識別子）にしてある。表示文言が変わっても
 * この対応は壊れない（Issue #17 と同じ教訓）。ここに無い datasetId は `general` にフォールバック
 * するため、将来カタログにデータセットが増えても未定義参照にはならない。
 *
 * `worker/core/catalog.ts` の定数はワーカー側専用（workerd／フロントエンドから import できない）
 * ため、実測値をそのまま文字列リテラルとして持つ。
 */
const CATEGORY_BY_DATASET_ID: Record<string, JntoCategory> = {
  t131067d0000000251: "shrineTemple", // 名所・史跡
  t131067d0000000256: "bathhouse", // 銭湯
  t000012d0000000063: "restaurant", // 東京都内の飲食店のバリアフリー情報（RESTAURANT_DATASET_ID）
  t131067d0000000247: "transitPark", // めぐりん停留所（東西めぐりん）
  t131130d2025000003: "transitPark", // 都市公園・都立公園一覧
};

/** 停留地・レコメンドの `datasetId` から JNTO 参考情報を引く。未知の ID は一般へフォールバック。 */
export function getJntoReference(datasetId: string): JntoReference {
  const category = CATEGORY_BY_DATASET_ID[datasetId] ?? "general";
  return JNTO_REFERENCES[category];
}
