/**
 * コア3操作（`search_datasets` / `aggregate_dataset` / `get_provenance`）の入出力型。
 *
 * `worker/`（実装側）と `src/`（React 側）の両方から参照する。実装とフロントエンドで
 * 型を二重に書くと、片方だけ直したときに気づけないため、ここを唯一の定義とする。
 * スキーマの SSOT は docs/02-design/API.md §3・§4、フロントエンド要件は同 API_REQUIREMENTS.md。
 *
 * この配下はブラウザ・workerd のどちらでも読める素の TypeScript に限る
 * （DOM 型・Node 型・`cloudflare:` 系に依存させない）。テストは置かない
 * （vitest のプロジェクトは src / worker / scripts のみを見ており、実行されない）。
 */

/**
 * 未回答の理由分類。DOMAIN.md §8 不変条件4「未回答は必ず理由分類され、記録される」。
 *
 * 値は D1 の `gaps.reason` の CHECK 制約（migrations/0001_init.sql）と同一。
 * 自由文字列を許すと分類が増殖して集計できなくなるため、閉じた列挙にする。
 */
export const UNANSWERED_REASONS = [
  /** カタログに該当データが存在しないことを確かめられた場合。最も強い主張なので、迷ったら使わない */
  "data_not_published",
  /** データはあるが、問いに答えられる粒度ではない（例: 飲食店データにジャンル列がない） */
  "insufficient_granularity",
  /** POC の対象エリア（上野・浅草・渋谷）の外 */
  "out_of_area",
  /** 上記のいずれにも当てはまらない（利用中の10件では答えられない、など） */
  "other",
] as const;

export type UnansweredReason = (typeof UNANSWERED_REASONS)[number];

/**
 * 「該当するオープンデータがありません」の応答。
 *
 * HTTP エラーではなく**正常な応答**として返す（API.md §4）。エラーにしてしまうと
 * 呼び出し側が握りつぶし、データ欠損が可視化されなくなる。
 */
export type Unanswered = {
  status: "unanswered";
  reason: UnansweredReason;
  /** 画面に出せる日本語の説明。何が無くて答えられなかったのかを具体的に書く */
  message: string;
};

/** POC の対象エリア。ビジネス制約（DOMAIN.md §8）で代表エリアに限定している */
export const REPRESENTATIVE_AREAS = ["上野", "浅草", "渋谷"] as const;
export type RepresentativeArea = (typeof REPRESENTATIVE_AREAS)[number];

/**
 * 1件以上あることを型で示す配列。
 *
 * 「回答は必ず1件以上の出典を持つ」（DOMAIN.md §8 不変条件1）を型で担保するために使う。
 * 空配列を許すと `status: "answered"` かつ候補・出典ゼロという仕様違反の応答が作れてしまい、
 * それは実際に `limit: 0` で到達可能だった。
 */
export type NonEmpty<T> = [T, ...T[]];

// ---------------------------------------------------------------------------
// 1. search_datasets — データセット検索
// ---------------------------------------------------------------------------

export type SearchDatasetsInput = {
  /**
   * 自然文の質問。必須。
   * 現状のマッチは日本語の部分一致で、英語のクエリには当たらない（API.md §3.1）。
   */
  query: string;
  /**
   * エリアの指定（例: "上野"）。
   * 代表エリア以外も**受け付ける**。型を `RepresentativeArea` に狭めないのは、対象エリア外を
   * 400 ではなく `unanswered("out_of_area")` として返すのがコア操作の仕事だから（API.md §4）。
   */
  area?: string;
  /**
   * 分類のヒント（例: "神社"、"公園"）。
   * 絞り込みの述語ではなく**スコアリングのヒント**として扱う。ただし指定したのに1件も当たらない
   * 場合はエリアだけの候補へ落とさず `unanswered` を返す（指定を黙って捨てないため）。
   */
  category?: string;
  /** 候補件数の上限。既定 4・上限 10（API.md §3.1） */
  limit?: number;
};

export type DatasetCandidate = {
  /** カタログのデータセットID */
  datasetId: string;
  title: string;
  provider: string;
  /** カタログページのURL。出典表示に使う */
  url: string;
  /** なぜこの質問に対して候補になるのか。データセットの実測値に基づく事実だけを書く */
  matchReason: string;
};

export type SearchDatasetsOutput =
  | { status: "answered"; candidates: NonEmpty<DatasetCandidate> }
  | Unanswered;

// ---------------------------------------------------------------------------
// 2. aggregate_dataset — 集計・抽出
// ---------------------------------------------------------------------------

export type AggregateDatasetInput = {
  datasetId: string;
  /** 集計意図（自然文）。例: "上野エリアの寺社を1件" */
  intent: string;
};

/**
 * 集計結果。フィールド名は汎用語彙で固定する（API.md 設計原則4）。
 * `Stop.place ← name` / `Stop.note ← summary` のマッピングはフロントエンド側の責務
 * （2026-08-17 合意・API_REQUIREMENTS.md §2）。
 */
export type AggregateResult = {
  name: string;
  summary: string;
};

export type AggregateDatasetOutput =
  | {
      status: "answered";
      result: AggregateResult;
      /** 実行したクエリ。出典に添えるため省略不可（API.md §4） */
      query: string;
    }
  | Unanswered;

// ---------------------------------------------------------------------------
// 3. get_provenance — 出典取得
// ---------------------------------------------------------------------------

export type GetProvenanceInput = {
  /**
   * 出典を取りたいデータセットID。1件以上（空配列は入力の形の違反として 400）。
   * 型を `NonEmpty` にしないのは、呼び出し側が `candidates.map(...)` の結果をそのまま
   * 渡せるようにするため。非空性は境界（parse）で検査する。
   */
  datasetIds: string[];
  /**
   * 集計を経た場合は実行クエリ、検索のみの場合は検索条件。必須。
   * 「実行クエリが無いから出典を省略する」は仕様違反（API.md §4）。
   */
  query: string;
};

export type ProvenanceSource = {
  /** カタログ上のデータセットID */
  datasetId: string;
  datasetTitle: string;
  provider: string;
  /**
   * 二次利用が許されるのは CC BY 4.0 のカタログ掲載データのみ（CLAUDE.md 絶対に守ること #4）。
   * リテラル型にすることで、カタログ外のデータを誤って組み込もうとすると型エラーになる。
   */
  license: "CC BY 4.0";
  url: string;
  /** 入力の `query` をそのまま添える（根拠の再現に必要） */
  query: string;
  /** スナップショットの取得日。カタログ最新版との差異を明示するため必須 */
  retrievedAt: string;
};

export type GetProvenanceOutput = { status: "answered"; sources: NonEmpty<ProvenanceSource> } | Unanswered;

// ---------------------------------------------------------------------------
// エラー応答（入力そのものが壊れている場合。「答えられない」とは区別する）
// ---------------------------------------------------------------------------

/**
 * 入力が仕様を満たさない場合（400）・未定義パス（404）・サーバー内部の例外（500）に返す形。
 *
 * 「答えが無い」（= `Unanswered`・HTTP 200）とは明確に区別する。混ぜると、
 * データ欠損が入力ミスに紛れて集計できなくなる。
 *
 * `internal_error` を型に持たせているのは、例外時に Hono の既定応答（`text/plain`）へ落ちると
 * JSON を期待するクライアントが壊れるため。未定義パスを 404 の JSON にしているのと同じ理由。
 */
export type ApiError = {
  error: "invalid_request" | "not_found" | "internal_error";
  message?: string;
};
