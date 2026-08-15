import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * フロントエンド（src/）専用の Vitest 設定。vite.config.ts とは分離する。
 * worker/ のテストは workerd 上で動く必要があるため @cloudflare/vitest-pool-workers を使う
 * 別設定になる想定（未着手）。同じ設定に混ぜると cloudflare() プラグインの環境設定と衝突するため分けている。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
