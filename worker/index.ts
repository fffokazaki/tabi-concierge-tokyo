import { Hono, type Context } from "hono";
import type { ApiError } from "../shared/core";
import { d1GapRecorder, type GapRecorder } from "./core/gaps";
import { coreDeps, type CoreDeps } from "./core/llm";
import { aggregateDataset, getProvenance, searchDatasets } from "./core/operations";
import { tabiMcpHandler } from "./mcp";
import {
  parseAggregateDatasetInput,
  parseGetProvenanceInput,
  parseSearchDatasetsInput,
  type ParseResult,
} from "./core/parse";

/**
 * `Env` は `wrangler types` が wrangler.jsonc から生成する（worker-configuration.d.ts）。
 * 手書きしないこと。バインディングを追加したら `npm run cf-typegen` で再生成する。
 */
const app = new Hono<{ Bindings: Env }>();

const badRequest = (c: Context<{ Bindings: Env }>, message: string) =>
  c.json({ error: "invalid_request", message } satisfies ApiError, 400);

/**
 * コア操作を `/api/*` に露出するアダプタ。
 *
 * ここでやるのは「JSON を読む・形を検査する・コアを呼ぶ」だけ。判断は `worker/core/` に置く
 * （ADR-008）。`/mcp` を足すときも同じコア関数を呼ぶので、ロジックが二重にならない。
 *
 * `run` の戻り値を `unknown` にせず型引数で受け、`await` する。Step 5 でコアを D1 対応の
 * async にしたとき、`c.json(Promise)` は `{}` にシリアライズされ、例外もログも出ないまま
 * HTTP 200 が返る（`c.json` は `JSON.stringify` を通すだけ）。型と `await` の両方で塞ぐ。
 *
 * 未回答の記録器はここで組み立ててコアへ渡す（Issue #27）。記録先は `/api/*` と `/mcp` で
 * 同じ D1 なので、判断と同じくコア側に置き、ルートは接続だけを担う（ADR-008）。
 */
const jsonRoute =
  <T, R>(
    parse: (body: unknown) => ParseResult<T>,
    run: (input: T, recorder: GapRecorder, deps: CoreDeps) => R | Promise<R>,
  ) =>
  async (c: Context<{ Bindings: Env }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch (cause) {
      // Workers で観測できるのは console.* → wrangler tail / Logpush だけ。捨てると
      // 本番で 400 が出た理由（不正 JSON / 通信断 / 解凍失敗）を追う手段が無くなる
      console.error("[api] リクエストボディを読めませんでした", { path: c.req.path, cause });
      return badRequest(c, "リクエストボディを JSON として読めません");
    }

    const parsed = parse(body);
    if (!parsed.ok) return badRequest(c, parsed.message);

    // 「該当データが無い」は unanswered として 200 で返す（HTTP エラーにしない。API.md §4）
    //
    // `deps` は3操作すべてに渡す。`getProvenance` は LLM も D1 も使わないため2引数で宣言されて
    // いるが、引数の少ない関数は多い関数型に代入できるので、ここで場合分けは要らない。
    // 場合分けを作ると「どの操作に何を渡すか」がルート側の判断になり、操作が増えるたびに
    // 渡し忘れの余地が生まれる
    return c.json(await run(parsed.value, d1GapRecorder(c.env.DB), coreDeps(c.env)));
  };

/**
 * 想定外の例外。Hono の既定は `text/plain` の 500 で、JSON を期待するクライアントが壊れる
 * （未定義パスを 404 の JSON にしているのと同じ理由）。原因は必ず記録する。
 */
app.onError((err, c) => {
  console.error("[api] 未捕捉の例外", { path: c.req.path, err });
  return c.json(
    { error: "internal_error", message: "サーバー内部でエラーが発生しました" } satisfies ApiError,
    500,
  );
});

/**
 * 疎通確認用。デプロイ経路が生きていることを最小コストで確認する。
 */
app.get("/api/health", (c) =>
  c.json({
    status: "ok",
    service: "tabi-concierge-tokyo",
    // ランタイムが workerd であることを、実際の値で示す。
    // ローカル（vite dev）でも本番でも同じ値になる。
    runtime: navigator.userAgent,
  }),
);

/** データセット検索（コア操作 `search_datasets`・API.md §3.1）。 */
app.post("/api/search-datasets", jsonRoute(parseSearchDatasetsInput, searchDatasets));

/** 集計・抽出（コア操作 `aggregate_dataset`・API.md §3.2）。 */
app.post("/api/aggregate-dataset", jsonRoute(parseAggregateDatasetInput, aggregateDataset));

/** 出典取得（コア操作 `get_provenance`・API.md §3.3）。 */
app.post("/api/provenance", jsonRoute(parseGetProvenanceInput, getProvenance));

/**
 * 基盤開放面（[MCP.md](../docs/02-design/MCP.md)・ADR-008）。
 *
 * ロジックは持たない。`/api/*` と同じ `worker/core/` の関数を、MCP のツールとして
 * 露出しているだけ（ツールの登録と入出力の変換は `mcp.ts`）。
 *
 * `app.all` にしてあるのは、GET / DELETE も SDK に渡して `405 Method not allowed.` を
 * **SDK の言葉で**返させるため。Hono 側で GET を弾くと、静的アセット（SPA の index.html）へ
 * 落ちて MCP クライアントが HTML を受け取る（`wrangler.jsonc` の `run_worker_first` に
 * `/mcp` があるので Worker には来るが、ルートが無ければ素通りする）。
 *
 * ハンドラはリクエストごとに組み立てる。env をクロージャで閉じ込める必要があり、
 * かつサーバ実体もリクエストごとに作り直す設計（ステートレス）なので、
 * モジュール読み込み時に1度だけ作る形にはしない。
 */
app.all("/mcp", (c) =>
  // `c.executionCtx` は実行時は workerd の ExecutionContext そのものだが、Hono は
  // 自前の最小宣言を持っており `tracing` / `abort` を欠く。型宣言だけのずれなのでここで揃える
  // （実体を作り替えているわけではない）
  tabiMcpHandler(c.env)(c.req.raw, c.env, c.executionCtx as unknown as ExecutionContext),
);

/**
 * `/api/*` は run_worker_first で Worker に来る。
 * 定義されていない API パスは、静的アセットへ落とさず 404 を返す
 * （SPA の index.html が返ると、クライアントが JSON を期待して壊れるため）。
 */
app.all("/api/*", (c) =>
  c.json(
    {
      error: "not_found",
      // メソッド違いもここに落ちるため、パスとメソッドのどちらが違うのか分かる文言にする
      message: "未定義の /api パス、またはメソッド違いです",
    } satisfies ApiError,
    404,
  ),
);

export default app;
