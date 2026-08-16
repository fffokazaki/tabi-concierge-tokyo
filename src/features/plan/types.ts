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
 * 返す想定の出典構造。Step 5 で `/api/*` 接続するまでは常に未設定（出典なしの回答を作らないため）。
 *
 * 2026-08-16 Okazaki 確認済み: `datasetId` / `license` / `query` の3フィールドとも
 * ドラフトどおりで確定（docs/02-design/API_REQUIREMENTS.md「ProvenanceSource フィールド確認結果」）。
 * エンドポイント自体はまだ実装されていないため、実装時に最終的な出力と突き合わせること。
 */
export type ProvenanceSource = {
  /** カタログ上のデータセットID。 */
  datasetId: string;
  datasetTitle: string;
  provider: string;
  /**
   * 二次利用が許されるのは CC BY 4.0 のカタログ掲載データのみ（CLAUDE.md 絶対に守ること #4）。
   * リテラル型にすることで、カタログ外のデータを誤って組み込もうとした場合に型エラーになる。
   */
  license: "CC BY 4.0";
  url: string;
  /**
   * 集計を伴う経路（aggregate_dataset）では実行クエリ、検索のみの経路（search_datasets）では
   * 検索条件を入れる（docs/02-design/API.md §4）。どちらの経路でも必須で、
   * 「実行クエリが無いから省略する」は仕様違反として扱う。
   */
  query: string;
  retrievedAt: string;
};

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
