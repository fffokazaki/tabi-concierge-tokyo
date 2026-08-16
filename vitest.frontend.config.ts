import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * src/（React）のテスト設定。ブラウザ相当の DOM を jsdom で用意する。
 *
 * vite.config.ts とは分離する。あちらは cloudflare() プラグインを含み、
 * vitest が読むと `resolve.external` が Worker 環境と非互換で Startup Error になる。
 * worker/ のテストは workerd で動かす必要があるため vitest.worker.config.ts に分けている。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    name: "frontend",
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
