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
 * オープンデータ・コンシェルジュの `get_provenance`（docs/02-design/API.md §3.3）が
 * 返す想定の出典構造。Step 5 で MCP 接続するまでは常に未設定（出典なしの回答を作らないため）。
 */
export type ProvenanceSource = {
  datasetTitle: string;
  provider: string;
  url: string;
  retrievedAt: string;
};

export type EtiquetteTip = {
  text: string;
  source?: ProvenanceSource;
};

export type Stop = {
  time: string;
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
  etiquette: EtiquetteTip[];
};

export type Screen = "setup" | "briefing";
