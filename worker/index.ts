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

/**
 * コア操作を `/api/*` に露出するアダプタ。
 *
 * ここでやるのは「JSON を読む・形を検査する・コアを呼ぶ」だけ。判断は `worker/core/` に置く
 * （ADR-008）。`/mcp` を足すときも同じコア関数を呼ぶので、ロジックが二重にならない。
 */
const jsonRoute =
  <T>(parse: (body: unknown) => ParseResult<T>, run: (input: T) => unknown) =>
  async (c: Context<{ Bindings: Env }>) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid_request", message: "リクエストボディを JSON として読めません" } satisfies ApiError, 400);
    }

    const parsed = parse(body);
    if (!parsed.ok) {
      return c.json({ error: "invalid_request", message: parsed.message } satisfies ApiError, 400);
    }

    // 「該当データが無い」は unanswered として 200 で返す（HTTP エラーにしない。API.md §4）
    return c.json(run(parsed.value));
  };

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
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
