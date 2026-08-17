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

/**
 * 検索したが確認できるデータが見つからなかったことを画面上に明示するためのカード用データ。
 * DOMAIN.md の GapReason でいう「粒度不足」に相当するケース（データ自体は存在するが、
 * 求めた粒度・エリアでは見つからない）を、推測で埋めずにそのまま提示する。
 */
export type DataGap = {
  /** 何を探していたか（例: "ラーメン店"）。カード見出しに使う。 */
  subject: string;
  title: string;
  explanation: string;
  /**
   * 東京都オープンデータポータルへのリクエスト送信を模したボタンに添える件数。
   * 完全な仮の数値（承認済みデザインカンプの表記をそのまま採用）で、実際のリクエスト件数ではない。
   * report_gap（DOMAIN.md §7 / API.md §3.4、検討中）が実装されるまでは集計の裏付けが無い。
   */
  requestCount: number;
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
  /** 該当データが見つからなかった検索があった場合のみ設定する（例: ramen シナリオのラーメン店検索）。 */
  dataGap?: DataGap;
  /**
   * stops の place・住所が東京都オープンデータで確認済みかどうか。true でも note・etiquette・
   * dataGap.requestCount 等は引き続き未検証（一般知識またはデザインカンプ由来の仮データ）。
   * PlanScreen.tsx のデモデータ表示文言をシナリオごとに出し分けるために使う。
   */
  placesFromOpenData: boolean;
};

export type Screen = "setup" | "briefing";
