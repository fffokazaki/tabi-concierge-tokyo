import { describe, expect, it } from "vitest";

import { extractRows, parseArgs } from "./query.ts";

/**
 * wrangler `d1 execute --json` が実際に返した stdout（2026-08-22 実測・本番 D1）。
 * meta の中身は抜粋。結果行が meta に押し出されるのがこのツールの動機なので、
 * テストも「本物の形」から meta を落とせているかで判定する。
 */
const REAL_PAYLOAD = JSON.stringify([
  {
    results: [{ n: 1645 }],
    success: true,
    meta: {
      served_by: "v3-prod",
      duration: 1.0125,
      changes: 0,
      size_after: 507904,
      rows_read: 1645,
      rows_written: 0,
    },
  },
]);

describe("extractRows", () => {
  it("1 文の応答から結果行だけを取り出す（meta を落とす）", () => {
    expect(extractRows(REAL_PAYLOAD)).toEqual({ rows: [{ n: 1645 }] });
  });

  it("0 行の結果はそのまま空配列を返す（照会は成立している）", () => {
    const payload = JSON.stringify([{ results: [], success: true, meta: {} }]);

    expect(extractRows(payload)).toEqual({ rows: [] });
  });

  it("success が false の応答は問題として返す（空の結果として通さない）", () => {
    const payload = JSON.stringify([{ results: [], success: false, meta: {} }]);

    const result = extractRows(payload);

    expect(result).toHaveProperty("problem");
    expect("rows" in result).toBe(false);
  });

  it("JSON として読めない stdout は問題として返す", () => {
    const result = extractRows("✘ [ERROR] something went wrong");

    expect(result).toHaveProperty("problem");
  });

  it("配列でない JSON（wrangler のエラーオブジェクト）は問題として返す", () => {
    const payload = JSON.stringify({ error: { text: "no such table: nope" } });

    expect(extractRows(payload)).toHaveProperty("problem");
  });

  it("空配列は問題として返す（1 文も実行されていない）", () => {
    expect(extractRows("[]")).toHaveProperty("problem");
  });

  it("複数文の応答は問題として返す（1 文目だけ黙って返さない）", () => {
    const payload = JSON.stringify([
      { results: [{ a: 1 }], success: true, meta: {} },
      { results: [{ b: 2 }], success: true, meta: {} },
    ]);

    const result = extractRows(payload);

    expect(result).toHaveProperty("problem");
    expect("rows" in result).toBe(false);
  });

  it("results が配列でない応答は問題として返す", () => {
    const payload = JSON.stringify([{ results: null, success: true, meta: {} }]);

    expect(extractRows(payload)).toHaveProperty("problem");
  });
});

describe("parseArgs", () => {
  it("--remote と SQL を受け取る", () => {
    expect(parseArgs(["--remote", "SELECT COUNT(*) AS n FROM spots"])).toEqual({
      target: "--remote",
      sql: "SELECT COUNT(*) AS n FROM spots",
    });
  });

  it("--local と SQL を受け取る", () => {
    expect(parseArgs(["--local", "SELECT 1"])).toEqual({
      target: "--local",
      sql: "SELECT 1",
    });
  });

  it("SQL が無ければ問題として返す", () => {
    expect(parseArgs(["--remote"])).toHaveProperty("problem");
  });

  it("SQL が空白だけなら問題として返す", () => {
    expect(parseArgs(["--remote", "   "])).toHaveProperty("problem");
  });

  it("SQL が 2 つ以上に割れていたら問題として返す（クォート忘れ）", () => {
    const result = parseArgs(["--remote", "SELECT", "COUNT(*)", "FROM", "spots"]);

    expect(result).toHaveProperty("problem");
    expect("sql" in result).toBe(false);
  });

  it("接続先の指定が無ければ問題として返す", () => {
    expect(parseArgs(["SELECT 1"])).toHaveProperty("problem");
  });
});
