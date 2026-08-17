import type { Budget, InterestTag, Pace, Setting } from "./types";

/**
 * ドメイン値 → 利用者向け表示ラベル。
 *
 * ドメイン値は ASCII の識別子（`types.ts`）で、表示文字列はここだけが持つ。分けておく理由は
 * [DOMAIN.md](../../../docs/02-design/DOMAIN.md) §11「コード上の識別子は英語／利用者向け表示は
 * 日本語・英語の2言語」で、値と表示が同じ文字列だと**英語へ切り替える座標が無い**（Issue #17）。
 *
 * `Record<T, string>` にしてあるので、union に値を足したときにラベルの書き漏れが
 * コンパイルエラーになる。`Partial` や添字型（`{ [k: string]: string }`）にすると、
 * 書き漏れが実行時の `undefined` になって画面に空文字が出る。
 *
 * **英語表示を足すときはここを `Record<T, Record<Locale, string>>` にする。** 呼び出し側は
 * すでにこのマップ越しに表示しているので、変更はこのファイルとロケールの受け渡しに閉じる。
 */

export const PACE_LABELS: Record<Pace, string> = {
  relaxed: "ゆったり",
  balanced: "バランス型",
  packed: "しっかり",
};

export const SETTING_LABELS: Record<Setting, string> = {
  outdoor: "屋外中心",
  mixed: "どちらも",
  indoor: "屋内中心",
};

export const BUDGET_LABELS: Record<Budget, string> = {
  thrifty: "節約",
  moderate: "中間価格帯",
  luxury: "ぜいたく",
};

export const INTEREST_LABELS: Record<InterestTag, string> = {
  ramen: "ラーメン",
  culture: "文化",
  family: "家族向け",
  nightlife: "ナイトライフ",
  shopping: "ショッピング",
  nature: "自然",
};
