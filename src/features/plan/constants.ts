import type { Budget, InterestTag, Pace, Setting, Trip } from "./types";

export const ADULTS_MIN = 1;
export const ADULTS_MAX = 12;
export const KIDS_MIN = 0;
export const KIDS_MAX = 8;
export const DAYS_MIN = 1;
export const DAYS_MAX = 21;

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
