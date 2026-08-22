import { describe, expect, it, vi } from "vitest";
import { callCoreOperation, peekAnswerStatus, CORE_ENDPOINTS, DEFAULT_TIMEOUT_MS } from "./coreOperations";

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

/**
 * 「応答しない」fetch のスタブ（Issue #146）。渡された `signal` が発火するまで一切
 * 解決しない ―― 実装が本当にタイムアウトを起こしているかを検証する（`vi.useFakeTimers`
 * だけでは、実装が `signal` を渡し忘れていても気づけない）。
 *
 * reject 理由は実測に基づく（Node 24 実行・Chrome 実行の両方で確認済み。
 * `AbortSignal.timeout()` は "TimeoutError" の `DOMException` で reject する）。
 */
const hangingFetch = (): typeof fetch =>
  vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
      });
    });
  }) as unknown as typeof fetch;

describe("callCoreOperation", () => {
  it("POST・JSON ボディ・確定パスで呼び出す", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: "answered", candidates: [] }));

    await callCoreOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    // signal は AbortSignal.timeout() が呼び出しごとに新しく作るインスタンスなので、
    // 参照の一致ではなく AbortSignal であることだけを見る（Issue #146）
    expect(fetchImpl).toHaveBeenCalledWith(CORE_ENDPOINTS.search_datasets, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "上野" }),
      signal: expect.any(AbortSignal),
    });
  });

  it("2xx の JSON は ok として生のボディを返す", async () => {
    const body = { status: "unanswered", reason: "out_of_area", message: "対象エリア外" };
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, body));

    const result = await callCoreOperation("search_datasets", { query: "新宿" }, { fetchImpl, now: fixedClock() });

    // unanswered も正常応答（API.md §4）。kind は ok のまま、区別はボディ側の status で行う
    expect(result).toEqual({ kind: "ok", status: 200, elapsedMs: 10, body });
  });

  it("4xx の JSON は http としてボディ（ApiError）を保つ", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(400, { error: "invalid_request", message: "query が必要" }));

    const result = await callCoreOperation("aggregate_dataset", {}, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({
      kind: "http",
      status: 400,
      body: { error: "invalid_request", message: "query が必要" },
    });
  });

  it("4xx の非 JSON（エラーページ等）は http として原文を保つ", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>Bad Gateway</html>", { status: 502 }));

    const result = await callCoreOperation("get_provenance", {}, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({ kind: "http", status: 502, rawText: "<html>Bad Gateway</html>" });
  });

  it("2xx の非 JSON は parse として原文を保つ（原因を消さない）", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response("<html>injected</html>", { status: 200 }));

    const result = await callCoreOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({ kind: "parse", status: 200, rawText: "<html>injected</html>" });
  });

  it("fetch の失敗は network として原因を保つ", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = await callCoreOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(result).toEqual({ kind: "network", elapsedMs: 10, detail: "Failed to fetch" });
  });

  it("本文の読み取り失敗は network ではなく parse（応答は届いている）", async () => {
    // ストリーム切断の再現。text() だけが落ちる Response を作る
    const brokenResponse = {
      ok: true,
      status: 200,
      text: () => Promise.reject(new Error("stream cut")),
    } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValue(brokenResponse);

    const result = await callCoreOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    // 「接続できません」に分類すると、HTTP ステータスを失い原因と逆方向へ誘導する
    expect(result).toMatchObject({ kind: "parse", status: 200, detail: "本文の読み取りに失敗: stream cut" });
  });

  it("シリアライズできないボディは input（サーバーには何も送っていない）", async () => {
    const fetchImpl = vi.fn();
    const circular: Record<string, unknown> = {};
    circular["self"] = circular;

    const result = await callCoreOperation("search_datasets", circular, { fetchImpl, now: fixedClock() });

    expect(result).toMatchObject({ kind: "input" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("応答しない呼び出しは timeoutMs 以内に打ち切り、network ではなく timeout として返す（Issue #146）", async () => {
    const fetchImpl = hangingFetch();
    const startedAt = Date.now();

    // 実時間を待つテストだが、既定値（6000ms）ではなく短い値を注入して速く済ませる
    const result = await callCoreOperation(
      "aggregate_dataset",
      { datasetId: "t1", intent: "上野" },
      { fetchImpl, timeoutMs: 20 },
    );

    // 打ち切られていること自体を実時間で確認する（実装が signal を渡し忘れていると、
    // このスタブは永遠に解決せずテストがタイムアウトで落ちる ―― それ自体が退行の検出）
    expect(Date.now() - startedAt).toBeLessThan(2000);
    expect(result).toMatchObject({ kind: "timeout", timeoutMs: 20 });
  });

  it("timeoutMs を省略すると DEFAULT_TIMEOUT_MS が使われる", async () => {
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(200, { status: "answered", candidates: [] }));

    await callCoreOperation("search_datasets", { query: "上野" }, { fetchImpl, now: fixedClock() });

    expect(timeoutSpy).toHaveBeenCalledWith(DEFAULT_TIMEOUT_MS);
    timeoutSpy.mockRestore();
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
