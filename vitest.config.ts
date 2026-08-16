import { defineConfig } from "vitest/config";

/**
 * `npm test` の入口。実行環境が違う2つのテスト群をまとめて走らせる。
 *
 * - frontend … src/（React）を jsdom で
 * - worker   … worker/（Hono）を workerd で
 *
 * 実行環境が違うので1つの設定には混ぜられない。片方だけ走らせたいときは
 * `npm run test:frontend` / `npm run test:worker` を使う。
 */
export default defineConfig({
  test: {
    projects: ["vitest.frontend.config.ts", "vitest.worker.config.ts"],
  },
});
