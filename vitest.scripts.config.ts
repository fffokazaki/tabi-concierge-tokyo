import { defineConfig } from "vitest/config";

/**
 * scripts/（データ取り込みツール）のテスト設定。
 *
 * これらは Node で動くビルド時ツールであり、workerd でも jsdom でもない。
 * CSV パースとエリア判定は取り込み結果を左右するため、振る舞いをテストで固定する。
 *
 * vite.config.ts とは分離する（あちらは cloudflare() を含み vitest が読むと落ちる）。
 */
export default defineConfig({
  test: {
    name: "scripts",
    environment: "node",
    include: ["scripts/**/*.test.ts"],
  },
});
