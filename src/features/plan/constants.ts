import type { Budget, InterestTag, Pace, Setting, Trip } from "./types";

/** 同行者カウンター（大人・子ども・滞在日数）の上下限をひとまとめにしたもの。 */
export const COUNTER_BOUNDS = {
  adults: { min: 1, max: 12 },
  kids: { min: 0, max: 8 },
  days: { min: 1, max: 21 },
} as const;

export const INTEREST_OPTIONS: InterestTag[] = [
  "ラーメン",
  "文化",
  "家族向け",
  "ナイトライフ",
  "ショッピング",
  "自然",
];
export const SETTING_OPTIONS: Setting[] = ["屋外中心", "どちらも", "屋内中心"];
export const PACE_OPTIONS: Pace[] = ["ゆったり", "バランス型", "しっかり"];
export const BUDGET_OPTIONS: Budget[] = ["節約", "中間価格帯", "ぜいたく"];

/** すべて未選択で始めると saveTrip のシナリオ選択が不安定になるため、プロトタイプと同じ初期値にする。 */
export const DEFAULT_TRIP: Trip = {
  adults: 2,
  kids: 0,
  days: 3,
  pace: "バランス型",
  setting: "どちらも",
  budget: "中間価格帯",
  interests: ["ラーメン", "文化"],
  notes: "",
};
