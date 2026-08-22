export type CategoryIllustrationGroup =
  | "transit"
  | "dining"
  | "lodging"
  | "culture"
  | "heritage"
  | "park"
  | "restroom"
  | "sento";

/**
 * 2026-08-16 の取り込み済みデータに存在する16分類。
 * 完全一致だけを許し、似た語から絵を推測しない。
 */
export const CATEGORY_ILLUSTRATION_GROUPS = {
  "「東西めぐりん（上野公園経由・三崎坂往復ルート）」停留所": "transit",
  "「東西めぐりん（鶯谷駅経由・日医大回りルート）」停留所": "transit",
  飲食店: "dining",
  下宿営業: "lodging",
  簡易宿所営業: "lodging",
  "旅館・ホテル営業": "lodging",
  観光: "culture",
  文化: "culture",
  博物館: "culture",
  美術館: "culture",
  区指定文化財: "heritage",
  区民文化財: "heritage",
  "名所・史跡": "heritage",
  公園: "park",
  公衆トイレ: "restroom",
  銭湯: "sento",
} as const satisfies Record<string, CategoryIllustrationGroup | null>;

export type KnownCategory = keyof typeof CATEGORY_ILLUSTRATION_GROUPS;

export function isKnownCategory(category: string): category is KnownCategory {
  return Object.prototype.hasOwnProperty.call(CATEGORY_ILLUSTRATION_GROUPS, category);
}
