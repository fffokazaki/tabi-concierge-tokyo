import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  AGGREGATE_PATH,
  jsonResponse,
  MEISHO_ID,
  provenanceSource,
  SEARCH_PATH,
  stubFetch,
  stubSuccessfulPlan,
  PROVENANCE_PATH,
} from "../../test/planFixtures";
import { COUNTER_BOUNDS } from "./constants";
import { usePlanState } from "./usePlanState";

/** 成功応答でルートが揃った状態まで進めたフックを返す */
async function renderReadyPlan(fetchImpl: typeof fetch) {
  const { result } = renderHook(() => usePlanState({ fetchImpl }));
  act(() => result.current.saveTrip());
  await waitFor(() => expect(result.current.request.status).toBe("ready"));
  return result;
}

describe("usePlanState", () => {
  it("clamps counters at their min/max bounds", () => {
    const { result } = renderHook(() => usePlanState());
    const { min, max } = COUNTER_BOUNDS.adults;

    act(() => {
      for (let i = 0; i < max + 5; i++) result.current.bumpCounter("adults", 1, min, max);
    });
    expect(result.current.trip.adults).toBe(max);

    act(() => {
      for (let i = 0; i < max + 5; i++) result.current.bumpCounter("adults", -1, min, max);
    });
    expect(result.current.trip.adults).toBe(min);
  });

  it("toggles interests on and off", () => {
    const { result } = renderHook(() => usePlanState());
    const before = result.current.trip.interests.includes("nature");

    act(() => result.current.toggleInterest("nature"));
    expect(result.current.trip.interests.includes("nature")).toBe(!before);

    act(() => result.current.toggleInterest("nature"));
    expect(result.current.trip.interests.includes("nature")).toBe(before);
  });
});

describe("ルートの組み立て（Issue #31）", () => {
  it("saveTrip でブリーフィングへ移り、応答が来るまで loading になる", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const { result } = renderHook(() => usePlanState({ fetchImpl }));

    act(() => result.current.saveTrip());
    // 無反応に見せない（AC: ローディング表示）
    expect(result.current.screen).toBe("briefing");
    expect(result.current.request.status).toBe("loading");

    await waitFor(() => expect(result.current.request.status).toBe("ready"));
  });

  it("応答由来の停留地と出典が並ぶ", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(["寛永寺", "国立西洋美術館", "燕湯"]);
    expect(result.current.orderedStops[0].source.datasetId).toBe(MEISHO_ID);
    // 順番ラベルは位置から導出する（時刻データを持っていないので時刻を捏造しない）
    expect(result.current.orderedStops.map((s) => s.positionLabel)).toEqual(["1番目", "2番目", "3番目"]);
  });

  it("unanswered は障害ではなく unanswered として保持する", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({ status: "unanswered", reason: "out_of_area", message: "「新宿」は対象エリアの外です。" }),
    });
    const { result } = renderHook(() => usePlanState({ fetchImpl }));

    act(() => result.current.saveTrip());
    await waitFor(() => expect(result.current.request.status).toBe("unanswered"));
    expect(result.current.request).toMatchObject({ reason: "out_of_area" });
  });

  it("障害は unanswered と別の状態にする", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) as unknown as typeof fetch;
    const { result } = renderHook(() => usePlanState({ fetchImpl }));

    act(() => result.current.saveTrip());
    await waitFor(() => expect(result.current.request.status).toBe("failed"));
    expect(result.current.request).toMatchObject({ failure: { kind: "network" } });
  });

  it("応答が無いときに前のルートへ黙って戻さない（ACE-28-1）", async () => {
    // 1回目は成功、2回目はネットワーク断
    let failNext = false;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (failNext) throw new TypeError("Failed to fetch");
      return stubSuccessfulPlan().fetchImpl(input, init);
    }) as unknown as typeof fetch;

    const { result } = renderHook(() => usePlanState({ fetchImpl }));
    act(() => result.current.saveTrip());
    await waitFor(() => expect(result.current.request.status).toBe("ready"));

    failNext = true;
    act(() => void result.current.requestPlan());
    await waitFor(() => expect(result.current.request.status).toBe("failed"));

    // 前回のルートが残っていると「取れた」と誤認される
    expect(result.current.orderedStops).toEqual([]);
  });
});

describe("停留地の並べ替えと選択", () => {
  it("ドラッグした停留地をドロップ位置へ動かす", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);

    act(() => result.current.reorderStop(0, 2));

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual([
      originalPlaces[1],
      originalPlaces[2],
      originalPlaces[0],
    ]);
  });

  it("順番ラベルは位置に紐づく（並べ替えても番号が前後しない）", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);
    const movedPlace = result.current.orderedStops[0].stop.place;

    act(() => result.current.reorderStop(0, 2));

    const reordered = result.current.orderedStops;
    expect(reordered.map((s) => s.positionLabel)).toEqual(["1番目", "2番目", "3番目"]);
    expect(reordered[2].stop.place).toBe(movedPlace);
  });

  it("不正な位置は無視して順序を変えない", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    act(() => result.current.reorderStop(Number.NaN, 2));
    act(() => result.current.reorderStop(5, 0));
    act(() => result.current.reorderStop(-1, 0));

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(originalPlaces);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it("停留地を選ぶとマナーの見出しがその停留地になり、解除で戻る", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);

    act(() => result.current.selectStop(0));
    expect(result.current.etiquetteTitle).toBe("寛永寺のマナー");

    act(() => result.current.clearStopSelection());
    expect(result.current.etiquetteTitle).toBe("このルートのマナー");
  });

  it("同じ停留地をもう一度選ぶと選択が外れる", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);

    act(() => result.current.selectStop(0));
    expect(result.current.selectedStopData).not.toBeNull();

    act(() => result.current.selectStop(0));
    expect(result.current.selectedStopData).toBeNull();
  });

  it("新しいルートを取り直すと並べ替えと選択がリセットされる", async () => {
    const { fetchImpl } = stubSuccessfulPlan();
    const result = await renderReadyPlan(fetchImpl);

    act(() => result.current.reorderStop(0, 2));
    act(() => result.current.selectStop(0));

    // 停留地が変わったのに前の並び順が残ると、別の地物に前の位置が付く
    act(() => void result.current.requestPlan());
    await waitFor(() => expect(result.current.request.status).toBe("ready"));

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(["寛永寺", "国立西洋美術館", "燕湯"]);
    expect(result.current.selectedStopData).toBeNull();
  });
});

describe("マナー", () => {
  it("出典のあるマナーが無いので空になる（仮のマナー文を出さない）", async () => {
    const { fetchImpl } = stubFetch({
      [SEARCH_PATH]: () =>
        jsonResponse({
          status: "answered",
          candidates: [{ datasetId: MEISHO_ID, title: "t", provider: "p", url: "u", matchReason: "r" }],
        }),
      [AGGREGATE_PATH]: () =>
        jsonResponse({ status: "answered", result: { name: "寛永寺", summary: "…" }, query: "q" }),
      [PROVENANCE_PATH]: () =>
        jsonResponse({ status: "answered", sources: [provenanceSource(MEISHO_ID, "名所・史跡")] }),
    });
    const result = await renderReadyPlan(fetchImpl);

    expect(result.current.displayedEtiquette).toEqual([]);
  });
});
