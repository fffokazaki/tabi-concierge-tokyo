import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SearchDatasetsOutput } from "../../shared/core";
import { applyMigrations, expectUnanswered, postJson, readGapRows, readJson } from "../test-support";
import { d1GapRecorder } from "./gaps";

/**
 * 未回答の記録が失敗したときの振る舞い（Issue #27 の AC）。
 *
 * **このファイルは意図的に `beforeAll(applyMigrations)` を置いていない。**
 * vitest-pool-workers の D1 はテストファイルごとに空で立ち上がるため、既定の状態では
 * `gaps` テーブルが存在せず INSERT が落ちる。これが「D1 への書き込みが失敗した状況」の
 * もっとも素直な再現になる（モックの D1 を組み立てるより、実際の失敗に近い）。
 */

afterEach(() => vi.restoreAllMocks());

describe("記録の失敗", () => {
  it("書き込みに失敗しても例外にしない（回答経路を落とさない）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      d1GapRecorder(env.DB).record([{ question: "新宿の美術館", area: "新宿", reason: "out_of_area" }]),
    ).resolves.toBeUndefined();
  });

  it("失敗を握りつぶさずログに出す", async () => {
    // Workers で観測できるのは console.* → wrangler tail / Logpush だけ。
    // 静かに消えると「gaps が 0 行なのは未回答が無いから」と誤読される
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await d1GapRecorder(env.DB).record([{ question: "新宿の美術館", reason: "out_of_area" }]);

    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][0]).toContain("[gaps]");
    // 何が記録できなかったのかを追えること（件数だけのログでは原因に辿り着けない）
    expect(spy.mock.calls[0][1]).toMatchObject({ count: 1, reasons: ["out_of_area"] });
  });

  it("記録に失敗しても API は unanswered を 200 で返す", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await postJson("/api/search-datasets", { query: "新宿の美術館" });

    // 「データが無い」という事実は、記録できなくても利用者へ届ける
    expect(response.status).toBe(200);
    const body = expectUnanswered(await readJson<SearchDatasetsOutput>(response));
    expect(body.reason).toBe("out_of_area");
  });

  it("0件の記録では書き込みを試みない（空振りのログを出さない）", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    await d1GapRecorder(env.DB).record([]);

    expect(spy).not.toHaveBeenCalled();
  });
});

describe("記録の成功", () => {
  it("スキーマがあれば行が入る（上の失敗が『テーブルが無いから』であることの確認）", async () => {
    await applyMigrations();

    await d1GapRecorder(env.DB).record([
      { question: "新宿の美術館", area: "新宿", category: "美術館", reason: "out_of_area" },
    ]);

    expect(await readGapRows()).toEqual([
      { question: "新宿の美術館", area: "新宿", category: "美術館", reason: "out_of_area" },
    ]);
  });
});
