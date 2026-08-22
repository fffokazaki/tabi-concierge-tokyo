import { createMcpHandler } from "agents/mcp/server";
import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { d1GapRecorder, type GapRecorder } from "./core/gaps";
import { coreDeps, type CoreDeps } from "./core/llm";
import { aggregateDataset, getProvenance, searchDatasets } from "./core/operations";
import {
  parseAggregateDatasetInput,
  parseGetProvenanceInput,
  parseSearchDatasetsInput,
  type ParseResult,
} from "./core/parse";

/**
 * `/mcp` 面 — コア3操作を MCP のツールとして公開する（[MCP.md](../docs/02-design/MCP.md)・ADR-008）。
 *
 * `/api/*`（`index.ts`）と**同じ `worker/core/` の関数を呼ぶ**。判断をこちらに書かない。
 * ここがやるのは「MCP の呼び出し規約とコア操作の間の変換」だけで、`index.ts` の `jsonRoute`
 * と対になる薄いアダプタである。
 *
 * ## ステートレスであること
 *
 * `createMcpHandler` はリクエストごとにサーバ実体を作り直す（`McpServer` を返す factory を
 * 受け取る設計）。セッションも Durable Objects も持たない。`McpAgent` は公式に deprecated /
 * feature-frozen なので使わない（MCP.md §4）。
 *
 * ステートレスであることの副作用として、2025 世代のセッション操作（GET / DELETE）は
 * SDK が `405 Method not allowed.` で返す。これは実装漏れではなく仕様である。
 */

/**
 * ツールの入力スキーマは**広告であって検査ではない**。
 *
 * 各フィールドを `z.unknown()` にしてあるのは意図的で、理由は2つある。
 *
 * 1. **スキーマの正規定義を増やさない。** 入力の形の SSOT は [API.md](../docs/02-design/API.md) §3 で、
 *    コード上の型は `shared/core.ts` にある。ここに `z.string().optional()` のような忠実な型を
 *    書くと3つ目の定義になり、片方だけ直したときに黙って食い違う。`z.unknown()` は**何も
 *    主張しない**ので、食い違いようがない。伝えるべき契約は `.describe()` の散文で渡す
 *    （AI クライアントが読むのは主にこちらである）
 * 2. **検査の実体を `parse.ts` に一本化する。** zod がここで弾いてしまうと、その入力は
 *    `parseSearchDatasetsInput` に届かず、`/api/*` とは別の文言のエラーが返る。zod が
 *    一切弾かないことで、**両面のエラーメッセージが同一であることが構造的に保証される**
 *    （境界規則が2箇所に散らないための設計。`parse.ts` の doc も参照）
 */
const advertised = (description: string) => z.unknown().optional().describe(description);

const SEARCH_DATASETS_SCHEMA = z.object({
  query: advertised(
    "自然文の質問（文字列）。`interests` を1件以上送る場合に限り省略できる。" +
      "現状のマッチは日本語の部分一致で、英語のクエリには当たらない。",
  ),
  area: advertised(
    'エリアの指定（文字列。例: "上野"）。代表エリア（上野・浅草・渋谷）以外も受け付け、' +
      "対象外は入力エラーではなく unanswered(out_of_area) として返す。`areas` との同時指定は不可。",
  ),
  areas: advertised(
    "**目的地として訊かれた**エリアの配列（文字列の配列）。送ると質問文からのエリア推測を行わない。" +
      "空配列は「目的地なし」の明示で、未指定とは意味が違う。最大20件。",
  ),
  interests: advertised(
    '興味の配列（文字列の配列）。要素は日本語の表示ラベル（例: "ナイトライフ"）。' +
      "返した候補が覆っていない興味は、1件ずつ欠損として応答に載り記録される。最大20件。",
  ),
  category: advertised(
    '分類のヒント（文字列。例: "神社"、"公園"）。絞り込みの述語ではなくスコアリングのヒントだが、' +
      "指定したのに1件も当たらない場合はエリアだけの候補へ落とさず unanswered を返す。",
  ),
  limit: advertised("候補件数の上限（整数）。既定 4・上限 10。"),
});

const AGGREGATE_DATASET_SCHEMA = z.object({
  datasetId: advertised("集計対象のデータセットID（文字列・必須）。`search_datasets` の候補から取る。"),
  intent: advertised('集計意図（自然文の文字列・必須）。例: "上野エリアの寺社を1件"'),
});

const GET_PROVENANCE_SCHEMA = z.object({
  datasetIds: advertised("出典を取りたいデータセットIDの配列（文字列の配列・1件以上）。"),
  query: advertised(
    "集計を経た場合は実行クエリ、検索のみの場合は検索条件（文字列・必須）。" +
      "「実行クエリが無いから出典を省略する」は仕様違反なので省略できない。",
  ),
});

/** MCP のツール結果。SDK の型に依存せず、この面が返す形をここで固定する。 */
type ToolResult = {
  content: [{ type: "text"; text: string }];
  isError?: boolean;
};

const ok = (payload: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(payload) }],
});

/**
 * 入力の形の違反。`/api/*` の 400 に対応する。
 *
 * **`unanswered` はここに来ない。** 「該当データが無い」は入力として正しく、正常な結果である
 * （API.md §4・DOMAIN.md §8）。`isError: true` にしてしまうと、MCP クライアントは
 * 「サーバが壊れた」と読み、本プロジェクトの中心設計である「答えられないことを answer として
 * 届ける」が `/mcp` 面だけ成立しなくなる。
 */
const invalid = (message: string): ToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

/**
 * 想定外の例外。`/api/*` の 500（`app.onError`）に対応する。
 *
 * **SDK に投げ返さない。** 実測（Issue #117・`@modelcontextprotocol/server@2.0.0`）では、
 * ツールのコールバックが投げた例外は SDK が捕まえて `isError: true` のツール結果へ変換し、
 * このとき **`createMcpHandler` の `onerror` は呼ばれず、例外の message がそのまま
 * クライアントへ渡る**（`{"content":[{"type":"text","text":"意図的な例外"}],"isError":true}`）。
 *
 * 投げっぱなしにすると2つ困る。
 *
 * 1. **どこにも記録が残らない。** Workers で観測できるのは `console.*` → wrangler tail /
 *    Logpush だけなので、本番でコアが壊れても気づく手段が無くなる（`gaps.ts` が
 *    「握りつぶさない」と定めているのと同じ理由）
 * 2. **内部の事情が漏れる。** `/api/*` は内部例外を「サーバー内部でエラーが発生しました」に
 *    畳んでから返している。`/mcp` だけ生の message を出すと、面によって漏れ方が変わる
 */
const internalError = (tool: string, cause: unknown): ToolResult => {
  console.error("[mcp] ツールの実行中に例外が発生しました", { tool, cause });
  return { content: [{ type: "text", text: "サーバー内部でエラーが発生しました" }], isError: true };
};

/**
 * 「形を検査して、コアを呼んで、JSON にする」の1本道。3ツールで同じ順序を踏む。
 *
 * `index.ts` の `jsonRoute` と同じ構造にしてあるのは、片方だけ手順が抜ける
 * （検査を飛ばす・記録器を渡し忘れる）ことを読んで気づけるようにするため。
 */
const toolFor =
  <T, R>(
    tool: string,
    parse: (body: unknown) => ParseResult<T>,
    run: (input: T, recorder: GapRecorder, deps: CoreDeps) => R | Promise<R>,
    recorder: GapRecorder,
    deps: CoreDeps,
  ) =>
  async (args: unknown): Promise<ToolResult> => {
    const parsed = parse(args);
    if (!parsed.ok) return invalid(parsed.message);
    try {
      return ok(await run(parsed.value, recorder, deps));
    } catch (cause) {
      return internalError(tool, cause);
    }
  };

/**
 * リクエスト1本ぶんの MCP サーバを組み立てる。
 *
 * 記録器（`GapRecorder`）を**ここで作って**コアへ渡す。テストから差し替えられるように
 * 引数で受けたくなるが、そうすると本番の配線が「渡し忘れても型が通る」形に戻ってしまう
 * （`gaps.ts` の doc 参照）。`/mcp` 経由の未回答が D1 に記録されることは、この関数を
 * そのまま使ったテストで実測する（DOMAIN.md §8 不変条件4 の両経路担保）。
 */
export function createTabiMcpServer(env: Env): McpServer {
  const server = new McpServer({ name: "tabi-concierge-tokyo", version: "0.1.0" });
  const recorder = d1GapRecorder(env.DB);
  // `/api/*` と同じ組み立て（`coreDeps`）を使う。ここで別物を組むと、面ごとに
  // LLM の向き先やゲートウェイが食い違っても気づけない（ADR-008 の「ロジックを二重に書かない」
  // は判断だけでなく、外部資源への到達手段にも効く）
  const deps = coreDeps(env);

  server.registerTool(
    "search_datasets",
    {
      title: "データセット検索",
      description:
        "東京都オープンデータカタログの収録データセットから、質問に答えられるものを探す。" +
        "答えられない場合は unanswered を理由分類つきで返す（エラーではない）。",
      inputSchema: SEARCH_DATASETS_SCHEMA,
    },
    toolFor("search_datasets", parseSearchDatasetsInput, searchDatasets, recorder, deps),
  );

  server.registerTool(
    "aggregate_dataset",
    {
      title: "集計・抽出",
      // 「意図に合う1件」とは言えない。名指しされた施設が無いときは同じエリアの別の行が返る
      // （Issue #153 の決定・`text-to-sql.ts` の `countRelaxed` doc）。外部クライアントへの
      // 広告で言い切ると、返った行が意図に一致していると誤認させる
      description:
        "指定したデータセットから、集計意図に近い1件を取り出す。" +
        "意図に名指しされた施設がこのデータセットに無い場合は、同じエリアの別の行が返る" +
        "（すり替えたことは応答に現れない）。" +
        "エリアは緩めないので、指定されたエリアの行が1件も無ければ unanswered。" +
        "実行したクエリを query として必ず添える（出典の再現に要る）。",
      inputSchema: AGGREGATE_DATASET_SCHEMA,
    },
    toolFor("aggregate_dataset", parseAggregateDatasetInput, aggregateDataset, recorder, deps),
  );

  server.registerTool(
    "get_provenance",
    {
      title: "出典取得",
      description:
        "データセットIDの配列に対して、CC BY 4.0 の出典（提供者・カタログURL・取得日）を返す。" +
        "出典を伴わない回答は仕様違反なので、回答を出す経路は必ずこれを通す。",
      inputSchema: GET_PROVENANCE_SCHEMA,
    },
    toolFor("get_provenance", parseGetProvenanceInput, getProvenance, recorder, deps),
  );

  return server;
}

/**
 * `/mcp` のハンドラ。`index.ts` から1ルートで呼ぶ。
 *
 * factory は env を受け取らない設計なので、リクエストごとにクロージャで包んで渡す
 * （ステートレス方針と整合する — サーバ実体もリクエストごとに作り直される）。
 */
export const tabiMcpHandler = (env: Env) =>
  createMcpHandler(() => createTabiMcpServer(env), {
    route: "/mcp",
    // ハンドラ層の異常（プロトコル違反・拒否したリクエストなど）の報告先。応答は変えない。
    //
    // **ツール実行中の例外はここに来ない**（SDK が手前で捕まえる。実測済み — `internalError`
    // の doc 参照）。ツール側の記録は `toolFor` が自分で行う。ここを足したからといって
    // コア側の例外が記録される、と読まないこと
    onerror: (error) => console.error("[mcp] ハンドラで異常を検出しました", { error }),
  });
