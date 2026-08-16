import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
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
 *
 * D1 のテスト用データベースは空で立ち上がる。migrations/ を読み込んで
 * バインディング経由でテストへ渡し、テスト側で applyD1Migrations する。
 * これをしないと "no such table" になる（スキーマは自動適用されない）。
 */
const migrations = await readD1Migrations("./migrations");

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      // miniflare 設定は cloudflareTest の引数に直接渡す。
      // 旧 API の test.poolOptions.workers.miniflare は現行版では読まれず、
      // バインディングが undefined のまま起動する（型では気づけない）
      miniflare: { bindings: { TEST_MIGRATIONS: migrations } },
    }),
  ],
  test: {
    name: "worker",
    include: ["worker/**/*.test.ts"],
  },
});
