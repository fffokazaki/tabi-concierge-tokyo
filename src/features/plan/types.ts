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
 * 画面が `/api/provenance` に接続するまでは常に未設定（出典なしの回答を作らないため）。
 */
export type { ProvenanceSource };

export type EtiquetteTip = {
  text: string;
  source?: ProvenanceSource;
};

export type Stop = {
  place: string;
  note: string;
  etiquette: EtiquetteTip[];
};

/**
 * シナリオの識別子。実質は閉じた集合なのに `string` だったため、`selectScenario("ramn")` の
 * ようなタイポが**黙って先頭シナリオへのフォールバックに変換**されていた（`?? scenarios[0]`）。
 * union にすることでコンパイル時に閉じる（Issue #17）。
 */
export const SCENARIO_IDS = ["ramen", "nightlife", "family"] as const;
export type ScenarioId = (typeof SCENARIO_IDS)[number];

export type Scenario = {
  id: ScenarioId;
  label: string;
  interest: InterestTag | null;
  prompt: string;
  stops: Stop[];
  /**
   * 表示用の時間帯ラベル。stops と同じ添字だが、意味は「並べ替え後の何番目に訪れるか」
   * という位置（position）であって、特定の Stop に紐づく属性ではない。
   * Stop 側に持たせると、並べ替えたときに元の Stop の時刻がそのままついてきてしまい、
   * 表示上の時刻が前後逆転する不具合になるため、意図的に分離してある。
   */
  schedule: string[];
  etiquette: EtiquetteTip[];
};

export type Screen = "setup" | "briefing";
