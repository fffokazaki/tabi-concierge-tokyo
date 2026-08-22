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
 * `GET /api/gaps/summary` が返す未回答ログの集計。
 *
 * 利用者の入力文 `gaps.question` は含めない。認証のない公開 API で個票を返すと、自由入力に
 * 個人情報が含まれていた場合にそのまま外へ出るため、公開境界は集計値だけに限定する
 * （API.md §3.4）。
 */
export type GapSummaryResponse = {
  total: number;
  byReason: Array<{ reason: UnansweredReason; count: number }>;
  byArea: Array<{ area: string | null; count: number }>;
  byReasonAndArea: Array<{ reason: UnansweredReason; area: string | null; count: number }>;
};

/**
 * 回答なし（該当するオープンデータが無い・見つからない）の応答。
 *
 * HTTP エラーではなく**正常な応答**として返す（API.md §4）。エラーにしてしまうと
 * 呼び出し側が握りつぶし、データ欠損が可視化されなくなる。
 */
export type Unanswered = {
  status: "unanswered";
  reason: UnansweredReason;
  /**
   * 画面に出せる日本語の説明。何が無くて答えられなかったのかを具体的に書く。
   * 「該当するオープンデータが〜」の名乗りは付けない — 名乗りは `status` / `reason`
   * （画面では見出し）が担う（API.md §4・Issue #107）
   */
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
   * 自然文の質問。`interests` を1件以上送る場合に限り省略できる（境界 `parse.ts` が検査する。
   * 型を optional にしてあるのは、興味チップだけの呼び出しを TypeScript クライアントが
   * 型どおりに書けるようにするため）。
   * 現状のマッチは日本語の部分一致で、英語のクエリには当たらない（API.md §3.1）。
   */
  query?: string;
  /**
   * エリアの指定（例: "上野"）。
   * 代表エリア以外も**受け付ける**。型を `RepresentativeArea` に狭めないのは、対象エリア外を
   * 400 ではなく `unanswered("out_of_area")` として返すのがコア操作の仕事だから（API.md §4）。
   */
  area?: string;
  /**
   * **目的地として訊かれた**エリアの配列（構造化入力・Issue #58／ADR-011）。
   *
   * これを送ると、質問文からのエリア推測を**行わない**。「渋谷から上野へ」の渋谷（出発地）を
   * 「訊かれた」と数える過検知は、質問文推測に構造上避けられないため、区別を呼び出し側の
   * 構造化データに委ねる。空配列は「目的地なし」の明示（未指定とは意味が違う）。
   *
   * 絞り込みに使うのは**最初の代表エリア1つ**（`area` と同じ制約）。代表エリア以外の要素は
   * 目的地と明示されたエリア外として扱い、`out_of_area` の欠損として応答に添える —
   * 応答全体が `unanswered` の場合も落とさない（`unanswered` 側の `gaps`・Issue #70。
   * 応答全体が `out_of_area` のときは、理由が報告する地名を除いた残りが載る）。
   * `area` との同時指定は 400。要素は正規化される（前後空白の除去・空要素と重複の除去）。
   */
  areas?: string[];
  /**
   * 興味の配列（構造化入力・Issue #53／ADR-011）。要素は日本語の表示ラベル（例: "ナイトライフ"。
   * `"culture"` のようなドメイン値の識別子はキーワード表に当たらない）。
   *
   * 候補のマッチに使うほか、**返した候補が覆っていない興味を1件ずつ `gaps` に載せる**。
   * 例外は2つ — 既知の欠損としてより強い分類で報告済みの興味は畳む（同じ欠損を2件にしない）。
   * 応答全体が `unanswered` になる経路では興味ごとの欠損は載せない（未回答は「何も答えて
   * いない」を全体として述べており、興味は記録の `question` 列に畳み込まれて残る — Issue #70
   * の判断。`areas` 由来の欠損と扱いが違う点に注意）。
   * 自然文（`query`）に畳み込むと「どの興味に答えたか」が判定できない（Issue #53）ため、
   * 畳み込む前の形をそのまま受ける。スタブは形態素解析を持たないので、判定は既存の
   * キーワード表との照合だけで行う。要素は正規化される（前後空白・空要素・重複の除去）。
   */
  interests?: string[];
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

/**
 * 部分欠損の1件。`unanswered` 応答と同じ形に、**その欠損がどのエリアについてのものか**を足したもの。
 *
 * `area` が要るのは、1つの応答に**別々のエリアについての欠損**が混ざるため（Issue #52）。
 * 「上野・渋谷」は上野の候補を返しつつ渋谷に答えていないので、応答全体のエリア（上野）と
 * この欠損のエリア（渋谷）が食い違う。記録（`gaps` テーブルの `area` 列）が応答全体の値だけを
 * 見ていると、**答えなかったエリアが集計から消える**。
 *
 * `message` から地名を抜き出す実装にはしない。文言を直した瞬間に集計が壊れるため、
 * 構造化した値として持つ（`worker/core/gaps.ts` の `GapRecord.area` と同じ理由）。
 *
 * **これを設定するのは、応答全体のエリアと必ず違う値になる欠損だけ**（取り落ち・Issue #52 と、
 * `areas` で目的地と明示されたエリア外・Issue #58）。常に埋める運用にはしない — 埋めると
 * 読み手が「応答のエリアと違うから書いてある」という区別を失う。ただしこれは型では縛れない
 * 約束なので、欠損の種類を足すときに読み直すこと。
 *
 * 型を `RepresentativeArea` に狭めない。`areas` の要素は対象エリア外（「新宿」など）でも
 * 目的地でありえて、その欠損は新宿**について**のものだから（`GapRecord.area` と同じ理由）。
 */
export type Gap = Unanswered & { area?: string };

export type SearchDatasetsOutput =
  | {
      status: "answered";
      candidates: NonEmpty<DatasetCandidate>;
      /**
       * **答えられた候補と一緒に返す、答えられなかった側面**（Issue #29）。
       *
       * 答えられる興味と答えられない興味を1つの `query` に混ぜられる（「上野の美術館とラーメン」）と、
       * 以前は美術館の候補だけを返し、ラーメン側の欠損は応答のどこにも現れなかった。
       * DOMAIN.md §8 不変条件4 が制約するのは応答であって文書なので、
       * 「文書に既知の制限として書く」では不変条件を満たしたことにならない。
       *
       * 欠損が無いときは**キーごと省く**。`NonEmpty` にしてあるので `gaps: []` は表現できない
       * （空配列を返すと、呼び出し側が「欠損の有無」を長さで判定する羽目になる）。
       *
       * 追加は optional なので、既存クライアントは無視しても壊れない。
       */
      gaps?: NonEmpty<Gap>;
    }
  | (Unanswered & {
      /**
       * **未回答と一緒に返す、理由が覆っていない別の欠損**（Issue #70）。
       *
       * `unanswered` の `reason` は1つしか運べないため、「ラーメンには粒度不足で答えられない」
       * を返すとき、`areas` で目的地と明示された新宿（対象エリア外）の欠損が応答からも
       * 記録からも消えていた。呼び出し側が構造化データで明示した欠損は、応答全体が
       * `unanswered` でも黙って落とさない（DOMAIN.md §8 不変条件4）。
       *
       * ここに載るのは **`areas` で目的地と明示されたものだけ**: 対象エリア外（`out_of_area`・
       * 理由が報告した地名を除く）と、代表エリアのうち絞り込みに使わなかったもの（`other`。
       * 絞り込みに使ったエリアは記録の `area` 列に残るが、2件目以降はこれが無いとどこにも
       * 残らない）。`interests` の興味ごとの粒度は載せない — 未回答応答は「何も答えていない」を全体として
       * 述べており、興味別の欠損 message（「返した候補のキーワードには〜」）は候補が存在しない
       * 文脈では嘘になる。興味は記録の `question` 列に畳み込まれて残る。
       *
       * 無いときは**キーごと省く**（answered 側の `gaps` と同じ規約）。optional 追加なので
       * 既存クライアントは無視しても壊れない。
       */
      gaps?: NonEmpty<Gap>;
    });

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
