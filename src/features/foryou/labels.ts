import type { InterestTag } from "../plan/types";

/**
 * レコメンドカードの「◆ 理由」タグに使う文言（例:「ラーメンがお好きなので」）。
 *
 * `plan/labels.ts` の `INTEREST_LABELS`（興味そのものの表示名。例:「ラーメン」）とは
 * 文型が違う一文なので、流用せず別マップとして持つ。`Record<InterestTag, string>` に
 * してあるので、`FORYOU_INTEREST_TAGS`（constants.ts）にどの興味を足しても
 * 書き漏れがコンパイルエラーになる。
 */
export const RECOMMENDATION_REASON_LABELS: Record<InterestTag, string> = {
  ramen: "ラーメンがお好きなので",
  culture: "文化に興味がおありなので",
  family: "ご家族でのご旅行なので",
  nightlife: "ナイトライフに興味がおありなので",
  shopping: "ショッピングがお好きなので",
  nature: "自然がお好きなので",
};

/** 「すべて」チップの表示ラベル。`InterestTag` union に無い UI 専用の値なので別枠で持つ。 */
export const ALL_INTERESTS_LABEL = "すべて";
