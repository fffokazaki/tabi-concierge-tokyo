/**
 * 利用オープンデータ 確定10件の定義（SSOT は docs/02-design/DATABASE.md §2）。
 *
 * ここに書いてある値はすべて 2026-08-16 にカタログ API（package_show）で実測したもの。
 * 推測で埋めない（CLAUDE.md）。カタログ側が変わったら fetch-data.ts が検出する。
 */

/** CSV の列構造。同じ台東区でもデータセットごとに形が違うため、取り込み方を型で分ける。 */
export type CsvShape =
  /** 台東区の独自形式: 大分類,小分類,名称,所在地,電話番号,情報,X座標,Y座標
   *  ※ X が経度・Y が緯度（自治体標準と並びが逆） */
  | "taito_legacy"
  /** 自治体標準オープンデータセット: 名称,所在地_連結表記,緯度,経度,... */
  | "standard"
  /** 銭湯（台東区・独自。営業時間と料金を持つ） */
  | "sento"
  /** 飲食店バリアフリー情報（都・独自。座標を持たない） */
  | "restaurant"
  /** クロス集計表。施設一覧ではないため spots へは取り込まない（出典としてのみ登録） */
  | "statistics";

export interface DatasetDef {
  /** カタログのデータセットID。CKAN の `name` と 1:1。出典URLの導出元 */
  id: string;
  title: string;
  /** 提供元。CKAN の organization.title */
  publisher: string;
  license: string;
  /** カタログ記載の更新頻度（extras.更新頻度） */
  updateFrequency: string;
  /** 原本の文字コード */
  sourceEncoding: "utf-8" | "shift_jis";
  shape: CsvShape;
  /** DATABASE.md §2 の No. */
  no: number;
  /** spots.category の既定値。データ側に分類列があればそちらを優先する */
  defaultCategory: string;
  /** 渋谷区のデータは区全体が渋谷エリアなので、町字マッピングを使わず固定する */
  fixedArea?: string;
  /**
   * エリア判定に使う情報源。既定は住所（完全一致で町字を引く）。
   * めぐりん停留所は所在地列が空で地名が名称にしかないため "name" を使う。
   */
  areaFrom?: "address" | "name";
}

export const CATALOG_BASE = "https://catalog.data.metro.tokyo.lg.jp";
export const RETRIEVED_AT = "2026-08-16";
export const LICENSE = "CC BY 4.0";

export const DATASETS: DatasetDef[] = [
  {
    no: 1,
    id: "t131067d0000000251",
    title: "名所・史跡",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "shift_jis",
    shape: "taito_legacy",
    defaultCategory: "名所・史跡",
  },
  {
    no: 2,
    id: "t131067d0000000236",
    title: "文化観光施設",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "shift_jis",
    shape: "taito_legacy",
    defaultCategory: "文化観光施設",
  },
  {
    no: 3,
    id: "t131067d0000000393",
    title: "文化財一覧",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年１回",
    sourceEncoding: "utf-8",
    shape: "standard",
    defaultCategory: "文化財",
  },
  {
    no: 4,
    id: "t131067d0000000249",
    title: "トイレ情報",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "utf-8",
    shape: "standard",
    defaultCategory: "公衆トイレ",
  },
  {
    no: 5,
    id: "t131067d0000000247",
    title: "めぐりん停留所（東西めぐりん）",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "shift_jis",
    shape: "taito_legacy",
    defaultCategory: "公共交通機関",
    // 所在地列が全件空。地名は停留所名にしか無い（2026-08-16 実データで確認）
    areaFrom: "name",
  },
  {
    no: 6,
    id: "t131067d0000000256",
    title: "銭湯",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "shift_jis",
    shape: "sento",
    defaultCategory: "銭湯",
  },
  {
    no: 7,
    id: "t131067d2025000004",
    title: "宿泊施設（旅館台帳）",
    publisher: "台東区",
    license: LICENSE,
    updateFrequency: "随時",
    sourceEncoding: "utf-8",
    shape: "standard",
    defaultCategory: "宿泊施設",
  },
  {
    no: 8,
    id: "t000012d0000000063",
    title: "東京都内の飲食店のバリアフリー情報",
    publisher: "東京都産業労働局",
    license: LICENSE,
    updateFrequency: "随時",
    sourceEncoding: "shift_jis",
    shape: "restaurant",
    defaultCategory: "飲食店",
  },
  {
    no: 9,
    id: "t000012d0000000081",
    title: "R6国・地域別外国人旅行者行動特性調査",
    publisher: "東京都産業労働局",
    license: LICENSE,
    updateFrequency: "年1回",
    sourceEncoding: "shift_jis",
    shape: "statistics",
    defaultCategory: "統計",
  },
  {
    no: 10,
    id: "t131130d2025000003",
    title: "都市公園・都立公園一覧",
    publisher: "渋谷区",
    license: LICENSE,
    updateFrequency: "随時",
    sourceEncoding: "utf-8",
    shape: "standard",
    defaultCategory: "公園",
    fixedArea: "渋谷",
  },
];

export const catalogUrl = (id: string) => `${CATALOG_BASE}/dataset/${id}`;
