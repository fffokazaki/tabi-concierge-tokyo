import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

/**
 * worker/ のテストを workerd 上で走らせる設定。
 *
 * Node で走らせると `navigator.userAgent` や workerd 固有の API が無いため、
 * 「ローカルは通るが本番で落ちる」テストになる。実行環境を本番と揃えるために
 * @cloudflare/vitest-pool-workers を使う。
 *
 * 互換設定（compatibility_date / flags）は wrangler.jsonc から読む。
 * ここに書き写すと本番とテストで設定がずれるため、二重管理しない。
 */
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } })],
  test: {
    name: "worker",
    include: ["worker/**/*.test.ts"],
  },
});
