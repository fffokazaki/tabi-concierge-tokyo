export type Pace = "ゆったり" | "バランス型" | "しっかり";
export type Setting = "屋外中心" | "どちらも" | "屋内中心";
export type Budget = "節約" | "中間価格帯" | "ぜいたく";
export type InterestTag = "ラーメン" | "文化" | "家族向け" | "ナイトライフ" | "ショッピング" | "自然";

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
 * 画面上は Step 5 で接続するまで常に未設定（出典なしの回答を作らないため）。
 */
import type { ProvenanceSource } from "../../../shared/core";

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

export type Scenario = {
  id: string;
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
