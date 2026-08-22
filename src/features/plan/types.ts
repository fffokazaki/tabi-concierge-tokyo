import type { ProvenanceSource } from "../../../shared/core";

/**
 * 旅のプロフィールのドメイン値。
 *
 * 値は **ASCII の識別子**にする（[DOMAIN.md](../../../docs/02-design/DOMAIN.md) §11
 * 「コード上の識別子は英語」）。以前は日本語の文字列リテラルで、**ドメイン値・表示文字列・
 * React key の三役**を兼ねていた。訪日観光客が対象である以上、利用者向け表示は日本語・英語の
 * 2言語が必要になるが、日本語リテラルのままでは切り替える座標が無い（Issue #17）。
 *
 * 表示ラベルは `labels.ts` の `Record<T, string>` が持つ。`Record` なので、union に値を
 * 足したときにラベルの書き漏れがコンパイルエラーになる。
 *
 * 配列を `as const` で定義して union を導出するのは、選択肢の一覧（`constants.ts`）と
 * 型が必ず一致するようにするため。片方だけ足しても気づけない形にしない。
 */

export const PACES = ["relaxed", "balanced", "packed"] as const;
export type Pace = (typeof PACES)[number];

export const SETTINGS = ["outdoor", "mixed", "indoor"] as const;
export type Setting = (typeof SETTINGS)[number];

export const BUDGETS = ["thrifty", "moderate", "luxury"] as const;
export type Budget = (typeof BUDGETS)[number];

export const INTEREST_TAGS = ["ramen", "culture", "family", "nightlife", "shopping", "nature"] as const;
export type InterestTag = (typeof INTEREST_TAGS)[number];

export type Trip = {
  adults: number;
  kids: number;
  days: number;
  pace: Pace;
  setting: Setting;
  budget: Budget;
  interests: InterestTag[];
  notes: string;
};

/**
 * `POST /api/provenance`（docs/02-design/API.md §3.3）が返す出典構造。
 *
 * 定義は `shared/core.ts` に移した（Issue #22）。同じ型を worker 側の実装と
 * 画面側で二重に書くと、片方だけ直したときに気づけないため、ここでは再エクスポートに留める。
 */
export type { ProvenanceSource };

/**
 * マナーの一言。
 *
 * `source` が optional なのは型の都合であって、**出典なしで画面に出してよいという意味ではない**。
 * 現状このリストは常に空で、出典を持つマナーのデータをカタログに確認できていない（Issue #43）。
 */
export type EtiquetteTip = {
  text: string;
  source?: ProvenanceSource;
};

/**
 * 旅程の停留地。
 *
 * `place` ← `aggregate_dataset` の `name` / `note` ← `summary`。この対応づけは
 * フロントエンド側の責務（2026-08-17 合意・API_REQUIREMENTS.md §2）。
 * 出典は `Stop` ではなく `SourcedStop`（`buildPlan.ts`）が対で持つ。
 * `Stop` に optional で足すと、出典なしの停留地が型として作れてしまう。
 */
export type Stop = {
  place: string;
  note: string;
  /** `aggregate_dataset` が選んだ D1 行の分類。見た目から推測しない。 */
  category: string;
  etiquette: EtiquetteTip[];
};

export type Screen = "setup" | "briefing";
