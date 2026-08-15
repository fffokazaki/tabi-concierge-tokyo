import { Hono } from "hono";

/**
 * `Env` は `wrangler types` が wrangler.jsonc から生成する（worker-configuration.d.ts）。
 * 手書きしないこと。バインディングを追加したら `npm run cf-typegen` で再生成する。
 */
const app = new Hono<{ Bindings: Env }>();

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

/**
 * `/api/*` は run_worker_first で Worker に来る。
 * 定義されていない API パスは、静的アセットへ落とさず 404 を返す
 * （SPA の index.html が返ると、クライアントが JSON を期待して壊れるため）。
 */
app.all("/api/*", (c) => c.json({ error: "not_found" }, 404));

export default app;
