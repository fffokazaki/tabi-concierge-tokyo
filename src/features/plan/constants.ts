import { BUDGETS, INTEREST_TAGS, PACES, SETTINGS, type Pace, type Trip } from "./types";

/** 同行者カウンター（大人・子ども・滞在日数）の上下限をひとまとめにしたもの。 */
export const COUNTER_BOUNDS = {
  adults: { min: 1, max: 12 },
  kids: { min: 0, max: 8 },
  days: { min: 1, max: 21 },
} as const;

/**
 * 画面に出す選択肢。型の定義（`types.ts`）から導いているので、union に値を足したのに
 * 選択肢へ出し忘れる／その逆、というずれが起きない。表示は `labels.ts` が担う。
 */
export const INTEREST_OPTIONS = INTEREST_TAGS;
export const SETTING_OPTIONS = SETTINGS;
export const PACE_OPTIONS = PACES;
export const BUDGET_OPTIONS = BUDGETS;

/** ペースに応じて表示する停留地数。応答の停留地数がこれより少ない場合はある分だけ表示する。 */
export const STOP_COUNT_BY_PACE: Record<Pace, number> = {
  relaxed: 2,
  balanced: 3,
  packed: 4,
};

/** すべて未選択で始めると saveTrip のシナリオ選択が不安定になるため、プロトタイプと同じ初期値にする。 */
export const DEFAULT_TRIP: Trip = {
  adults: 2,
  kids: 0,
  days: 3,
  pace: "balanced",
  setting: "mixed",
  budget: "moderate",
  interests: ["ramen", "culture"],
  notes: "",
};
