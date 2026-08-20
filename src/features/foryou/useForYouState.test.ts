import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { jsonResponse, MEISHO_ID, stubFetch } from "../../test/planFixtures";
import { AGGREGATE_PATH, SEARCH_PATH, stubSuccessfulRecommendations } from "../../test/forYouFixtures";
import { useForYouState } from "./useForYouState";

describe("useForYouState", () => {
  it("既定は「すべて」で、idle のまま何も呼ばない", () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    expect(result.current.activeInterest).toBe("all");
    expect(result.current.request.status).toBe("idle");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("ensureLoaded で最初の読み込みが始まり、応答が来ると ready になる", async () => {
    const { fetchImpl } = stubSuccessfulRecommendations();
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.ensureLoaded());
    expect(result.current.request.status).toBe("loading");

    await waitFor(() => expect(result.current.request.status).toBe("ready"));
    expect(result.current.request.status === "ready" && result.current.request.recommendations).toHaveLength(2);
  });

  it("未回答の内訳（gaps）をそのまま状態へ運ぶ（Issue #92・#94）", async () => {
    // ビルダーが gaps を載せても、フックが落としたら画面には出ない
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
          gaps: [{ status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" }],
        }),
      [AGGREGATE_PATH]: () =>
        jsonResponse({ status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" }),
    });
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.request.status).toBe("unanswered"));
    expect(result.current.request.status === "unanswered" && result.current.request.gaps).toEqual([
      { status: "unanswered", reason: "other", message: "「ショッピング」に当たるものがありませんでした。" },
      { status: "unanswered", reason: "insufficient_granularity", message: "内容を取り出せません。" },
    ]);
  });

  it("ensureLoaded を2回呼んでも、idle から動いたあとは再度読み込まない", async () => {
    const { fetchImpl, calls } = stubSuccessfulRecommendations();
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.ensureLoaded());
    await waitFor(() => expect(result.current.request.status).toBe("ready"));
    const callCountAfterFirst = calls.length;

    act(() => result.current.ensureLoaded());
    expect(calls.length).toBe(callCountAfterFirst);
  });

  it("チップを切り替えると activeInterest が変わり、その興味で取り直す", async () => {
    const { fetchImpl, calls } = stubSuccessfulRecommendations();
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.setActiveInterest("culture"));
    expect(result.current.activeInterest).toBe("culture");

    await waitFor(() => expect(result.current.request.status).toBe("ready"));
    const searchCall = calls.find((call) => call.path === SEARCH_PATH);
    expect((searchCall?.body as { interests: string[] }).interests).toEqual(["文化"]);
  });

  it("応答が無いときに前の結果へ黙って戻さない（連打ガード）", async () => {
    let resolveFirst!: (value: Response) => void;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path === SEARCH_PATH) {
        const body = init?.body ? JSON.parse(String(init.body)) : {};
        // 最初の呼び出し（ramen）だけ意図的に遅らせ、2回目（culture）が先に解決するようにする
        if ((body.interests as string[])[0] === "ラーメン") {
          return new Promise<Response>((resolve) => {
            resolveFirst = resolve;
          });
        }
      }
      return stubSuccessfulRecommendations().fetchImpl(input, init);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.setActiveInterest("ramen"));
    act(() => result.current.setActiveInterest("culture"));
    await waitFor(() => expect(result.current.request.status).toBe("ready"));

    // 遅延させていた ramen の応答が後から届いても、culture の結果を上書きしない
    act(() => resolveFirst(jsonResponse({ status: "unanswered", reason: "insufficient_granularity", message: "…" })));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current.request.status).toBe("ready");
  });

  it("unanswered は障害ではなく unanswered として保持する", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({ status: "unanswered", reason: "insufficient_granularity", message: "「ラーメン」の粒度では…" }),
    });
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.setActiveInterest("ramen"));
    await waitFor(() => expect(result.current.request.status).toBe("unanswered"));
    expect(result.current.request).toMatchObject({ reason: "insufficient_granularity" });
  });

  it("障害は unanswered と別の状態にする", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const { result } = renderHook(() => useForYouState({ fetchImpl }));

    act(() => result.current.setActiveInterest("culture"));
    await waitFor(() => expect(result.current.request.status).toBe("failed"));
    expect(result.current.request).toMatchObject({ failure: { kind: "network" } });
  });

  it("retry は現在の activeInterest のまま取り直す", async () => {
    let attempt = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input) === SEARCH_PATH) {
        attempt += 1;
        if (attempt === 1) throw new TypeError("Failed to fetch");
      }
      return stubSuccessfulRecommendations().fetchImpl(input, init);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => useForYouState({ fetchImpl }));
    act(() => result.current.setActiveInterest("culture"));
    await waitFor(() => expect(result.current.request.status).toBe("failed"));

    act(() => result.current.retry());
    await waitFor(() => expect(result.current.request.status).toBe("ready"));
    expect(result.current.activeInterest).toBe("culture");
  });
});
