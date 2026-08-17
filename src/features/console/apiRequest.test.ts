import { describe, expect, it, vi } from "vitest";
import { callOperation, peekAnswerStatus, CONSOLE_ENDPOINTS } from "./apiRequest";

/**
 * 「叩いて分類する」ロジックの検証。fetch と時計を注入し、ブラウザなしで
 * 全ての失敗経路を通す（health.ts のテストと同じ方針）。
 */

/** 呼び出しごとに 10ms 進む時計。elapsedMs の計算が実時間に依存しないようにする */
const fixedClock = () => {
  let tick = 0;
  return () => (tick += 10);
};

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("callOperation", () => {
  it("POST・JSON ボディ・確定パスで呼び出す", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: "answered", candidates: [] }));

    await callOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(fetchImpl).toHaveBeenCalledWith(CONSOLE_ENDPOINTS.search_datasets, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "上野" }),
    });
  });

  it("2xx の JSON は ok として生のボディを返す", async () => {
    const body = { status: "unanswered", reason: "out_of_area", message: "対象エリア外" };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, body));

    const result = await callOperation("search_datasets", { query: "新宿" }, { fetchImpl, now: fixedClock() });

    // unanswered も正常応答（API.md §4）。kind は ok のまま、区別はボディ側の status で行う
    expect(result).toEqual({ kind: "ok", status: 200, elapsedMs: 10, body });
  });

  it("4xx の JSON は http としてボディ（ApiError）を保つ", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: "invalid_request", message: "query が必要" }));

    const result = await callOperation("aggregate_dataset", {}, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({
      kind: "http",
      status: 400,
      body: { error: "invalid_request", message: "query が必要" },
    });
  });

  it("4xx の非 JSON（エラーページ等）は http として原文を保つ", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const result = await callOperation("get_provenance", {}, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({ kind: "http", status: 502, rawText: "<html>Bad Gateway</html>" });
  });

  it("2xx の非 JSON は parse として原文を保つ（原因を消さない）", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>injected</html>", { status: 200 }));

    const result = await callOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({ kind: "parse", status: 200, rawText: "<html>injected</html>" });
  });

  it("fetch の失敗は network として原因を保つ", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(result).toEqual({ kind: "network", elapsedMs: 10, detail: "Failed to fetch" });
  });
});

describe("peekAnswerStatus", () => {
  it("answered / unanswered をそのまま返す", () => {
    expect(peekAnswerStatus({ status: "answered", candidates: [] })).toBe("answered");
    expect(peekAnswerStatus({ status: "unanswered", reason: "other" })).toBe("unanswered");
  });

  it("仕様外の値でも落とさず unknown にする（コンソールは仕様外を見せる道具）", () => {
    expect(peekAnswerStatus({ status: "maybe" })).toBe("unknown");
    expect(peekAnswerStatus({})).toBe("unknown");
    expect(peekAnswerStatus(null)).toBe("unknown");
    expect(peekAnswerStatus("answered")).toBe("unknown");
  });
});
