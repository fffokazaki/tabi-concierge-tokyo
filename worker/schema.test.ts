import type { D1Migration } from "@cloudflare/vitest-pool-workers";
import { applyD1Migrations, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * TEST_MIGRATIONS は vitest.worker.config.ts がテスト時にだけ注入するバインディング。
 * 本番の `Env` は wrangler.jsonc から生成されるためこれを含まない。
 * 本番型を汚さないよう、テスト側で局所的に足す。
 */
const testEnv = env as Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] };

/**
 * スキーマそのものの不変条件を検証する。
 *
 * 「出典のない回答を作らない」（DOMAIN.md §8 不変条件1）は、本プロジェクトの中心設計。
 * これをクエリ側の作法ではなくスキーマ制約で守れているかを、実際に壊しにいって確かめる。
 */
beforeAll(async () => {
  await applyD1Migrations(testEnv.DB, testEnv.TEST_MIGRATIONS);
  await env.DB.prepare(
    `INSERT INTO datasets (id, no, title, publisher, license, catalog_url, resource_url, retrieved_at, update_frequency, row_count, has_spots)
     VALUES ('t131067d0000000251', 1, '名所・史跡', '台東区', 'CC BY 4.0', 'https://example.invalid/d', 'https://example.invalid/r', '2026-08-16', '年1回', 45, 1)`,
  ).run();
});

describe("出典の強制（DOMAIN.md §8 不変条件1）", () => {
  it("存在するデータセットに紐づくスポットは作れる", async () => {
    const r = await env.DB.prepare(
      `INSERT INTO spots (dataset_id, name, category, area, source_row) VALUES ('t131067d0000000251', '浅草寺', '名所・史跡', '浅草', 1)`,
    ).run();
    expect(r.success).toBe(true);
  });

  it("存在しないデータセットIDのスポットは作れない（外部キー）", async () => {
    await expect(
      env.DB.prepare(
        `INSERT INTO spots (dataset_id, name, category, source_row) VALUES ('does-not-exist', 'にせスポット', 'x', 1)`,
      ).run(),
    ).rejects.toThrow();
  });

  it("dataset_id が NULL のスポットは作れない", async () => {
    await expect(
      env.DB.prepare(`INSERT INTO spots (dataset_id, name, category, source_row) VALUES (NULL, '出典なし', 'x', 1)`).run(),
    ).rejects.toThrow();
  });
});

describe("座標の取り違え防止", () => {
  it("緯度と経度を入れ替えた値は CHECK 制約で弾かれる", async () => {
    // 台東区の独自形式は X=経度・Y=緯度 で自治体標準と並びが逆。
    // 取り違えると lat に 139 台が入るため、スキーマ側で落とす
    await expect(
      env.DB.prepare(
        `INSERT INTO spots (dataset_id, name, category, lat, lon, source_row)
         VALUES ('t131067d0000000251', '座標あべこべ', 'x', 139.7967, 35.7148, 1)`,
      ).run(),
    ).rejects.toThrow();
  });

  it("正しい並びの座標は通る", async () => {
    const r = await env.DB.prepare(
      `INSERT INTO spots (dataset_id, name, category, lat, lon, source_row)
       VALUES ('t131067d0000000251', '待乳山聖天', '名所・史跡', 35.7173, 139.8030, 1)`,
    ).run();
    expect(r.success).toBe(true);
  });
});

describe("未回答ログ（DOMAIN.md §8 不変条件4）", () => {
  it("API_REQUIREMENTS.md と同じ英語の理由分類だけを受け付ける", async () => {
    for (const reason of ["data_not_published", "insufficient_granularity", "out_of_area", "other"]) {
      const r = await env.DB.prepare(`INSERT INTO gaps (question, reason) VALUES (?, ?)`)
        .bind("上野でおすすめのラーメンは？", reason)
        .run();
      expect(r.success).toBe(true);
    }
  });

  it("分類外の理由は記録できない（silent failure の禁止）", async () => {
    await expect(
      env.DB.prepare(`INSERT INTO gaps (question, reason) VALUES ('q', 'なんとなく')`).run(),
    ).rejects.toThrow();
  });
});
