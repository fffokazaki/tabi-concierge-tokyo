import { Hono, type Context } from "hono";
import type { ApiError } from "../shared/core";
import { aggregateDataset, getProvenance, searchDatasets } from "./core/operations";
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
 */
const jsonRoute =
  <T, R>(parse: (body: unknown) => ParseResult<T>, run: (input: T) => R | Promise<R>) =>
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
    return c.json(await run(parsed.value));
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
