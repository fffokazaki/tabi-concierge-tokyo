import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { COUNTER_BOUNDS } from "./constants";
import { MOCK_SCENARIOS } from "./mockScenarios";
import { usePlanState } from "./usePlanState";
import type { Scenario } from "./types";

describe("MOCK_SCENARIOS", () => {
  it("keeps the ramen scenario's data gap card so it can't be silently dropped", () => {
    const ramen = MOCK_SCENARIOS.find((s) => s.id === "ramen");
    expect(ramen?.dataGap?.subject).toBe("ラーメン店");
  });

  it("leaves nightlife without a data gap, since it stays fully mock this round", () => {
    const nightlife = MOCK_SCENARIOS.find((s) => s.id === "nightlife");
    expect(nightlife?.dataGap).toBeUndefined();
  });
});

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
    const before = result.current.trip.interests.includes("自然");

    act(() => result.current.toggleInterest("自然"));
    expect(result.current.trip.interests.includes("自然")).toBe(!before);

    act(() => result.current.toggleInterest("自然"));
    expect(result.current.trip.interests.includes("自然")).toBe(before);
  });

  it("picks the family scenario once kids > 0, regardless of interests", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.bumpCounter("kids", 1, 0, 8));
    act(() => result.current.saveTrip());
    expect(result.current.activeScenario.id).toBe("family");
    expect(result.current.screen).toBe("briefing");
  });

  it("picks the nightlife scenario when that interest is selected and there are no kids", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.toggleInterest("ナイトライフ"));
    act(() => result.current.saveTrip());
    expect(result.current.activeScenario.id).toBe("nightlife");
  });

  it("falls back to the ramen scenario by default", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.saveTrip());
    expect(result.current.activeScenario.id).toBe("ramen");
  });

  it("matches a scenario via its own interest field generically, not just the hardcoded nightlife check", () => {
    const { result } = renderHook(() => usePlanState());
    // デフォルトの興味には「自然」が含まれない。「ラーメン」「文化」を外し「自然」だけにすると
    // どのシナリオの interest フィールドとも一致しなくなり、フォールバックの ramen になる
    act(() => result.current.toggleInterest("ラーメン"));
    act(() => result.current.toggleInterest("文化"));
    act(() => result.current.toggleInterest("自然"));
    act(() => result.current.saveTrip());
    expect(result.current.activeScenario.id).toBe("ramen"); // フォールバックとしての ramen
  });

  it("prioritizes kids over a matching interest when both apply", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.bumpCounter("kids", 1, 0, 8));
    act(() => result.current.toggleInterest("ナイトライフ")); // nightlife にも一致しうる状態
    act(() => result.current.saveTrip());
    expect(result.current.activeScenario.id).toBe("family"); // kids のチェックが先に効く
  });

  it("switches scenarios directly via selectScenario, independent of saveTrip's picking rule", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.saveTrip()); // ramen (default)
    expect(result.current.activeScenario.id).toBe("ramen");

    act(() => result.current.selectScenario("nightlife"));
    expect(result.current.activeScenario.id).toBe("nightlife");

    act(() => result.current.selectScenario("family"));
    expect(result.current.activeScenario.id).toBe("family");
  });

  it("reorders stops by moving the dragged item to its drop position", () => {
    const { result } = renderHook(() => usePlanState());
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);

    act(() => result.current.reorderStop(0, 2));

    const reorderedPlaces = result.current.orderedStops.map((s) => s.stop.place);
    expect(reorderedPlaces).toEqual([originalPlaces[1], originalPlaces[2], originalPlaces[0]]);
  });

  it("keeps displayed times tied to position (not the stop) after reordering, so times never go backwards", () => {
    const { result } = renderHook(() => usePlanState());
    const originalTimes = result.current.orderedStops.map((s) => s.time);
    const movedPlace = result.current.orderedStops[0].stop.place;

    act(() => result.current.reorderStop(0, 2));

    const reordered = result.current.orderedStops;
    // 時刻は位置（schedule[pos]）に紐づくので、並べ替え前と同じ並びのまま
    expect(reordered.map((s) => s.time)).toEqual(originalTimes);
    // 移動した停留地は最後の位置に来て、その位置の時刻を引き継ぐ
    expect(reordered[2].stop.place).toBe(movedPlace);
    expect(reordered[2].time).toBe(originalTimes[2]);
  });

  it("shows a different number of stops depending on pace", () => {
    const { result } = renderHook(() => usePlanState());

    act(() => result.current.setTrip("pace", "ゆったり"));
    expect(result.current.orderedStops).toHaveLength(2);

    act(() => result.current.setTrip("pace", "バランス型"));
    expect(result.current.orderedStops).toHaveLength(3);

    act(() => result.current.setTrip("pace", "しっかり"));
    expect(result.current.orderedStops).toHaveLength(4);
  });

  it("rejects reorderStop positions beyond what's currently visible for the pace", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.setTrip("pace", "ゆったり")); // 2件だけ表示
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    act(() => result.current.reorderStop(0, 2)); // 2 は非表示（3・4番目）の位置なので不正

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(originalPlaces);
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("keeps schedule[pos] correct after reordering within a reduced pace, and after switching pace back up", () => {
    const { result } = renderHook(() => usePlanState());
    act(() => result.current.setTrip("pace", "ゆったり")); // 2件表示
    const [firstPlace, secondPlace] = result.current.orderedStops.map((s) => s.stop.place);
    const [time0, time1] = result.current.orderedStops.map((s) => s.time);

    act(() => result.current.reorderStop(0, 1)); // 表示中の2件だけを入れ替え

    const afterSwap = result.current.orderedStops;
    expect(afterSwap.map((s) => s.stop.place)).toEqual([secondPlace, firstPlace]);
    // 時刻は位置に紐づくので、並べ替え後も schedule[0]/schedule[1] のまま
    expect(afterSwap.map((s) => s.time)).toEqual([time0, time1]);

    act(() => result.current.setTrip("pace", "しっかり")); // 4件表示に戻す
    const full = result.current.orderedStops;
    expect(full).toHaveLength(4);
    // 各位置の時刻は activeScenario.schedule[pos] とそのまま一致する（隠れていた3・4番目も破損していない）
    full.forEach((s, pos) => {
      expect(s.time).toBe(result.current.activeScenario.schedule[pos]);
    });
  });

  it("rejects invalid reorderStop positions and leaves the order unchanged", () => {
    const { result } = renderHook(() => usePlanState());
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    act(() => result.current.reorderStop(Number.NaN, 2));
    act(() => result.current.reorderStop(5, 0)); // out of range for a 3-stop scenario
    act(() => result.current.reorderStop(-1, 0));

    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(originalPlaces);
    expect(warnSpy).toHaveBeenCalledTimes(3);
    warnSpy.mockRestore();
  });

  it("filters the etiquette list to the selected stop and clears back to the route-level list", () => {
    const { result } = renderHook(() => usePlanState());
    const firstStop = result.current.activeScenario.stops[0];

    act(() => result.current.selectStop(0));
    expect(result.current.displayedEtiquette).toEqual(firstStop.etiquette);
    expect(result.current.etiquetteTitle).toBe(`${firstStop.place}のマナー`);

    act(() => result.current.clearStopSelection());
    expect(result.current.displayedEtiquette).toEqual(result.current.activeScenario.etiquette);
  });

  it("deselects a stop when it's selected again (toggle-off)", () => {
    const { result } = renderHook(() => usePlanState());
    const routeLevelEtiquette = result.current.activeScenario.etiquette;

    act(() => result.current.selectStop(0));
    expect(result.current.selectedStopData).not.toBeNull();

    act(() => result.current.selectStop(0));
    expect(result.current.selectedStopData).toBeNull();
    expect(result.current.displayedEtiquette).toEqual(routeLevelEtiquette);
  });

  it("accepts an injected scenarios list instead of the built-in mock data", () => {
    const customScenarios: Scenario[] = [
      {
        id: "custom",
        label: "テストシナリオ",
        placesFromOpenData: false,
        interest: null,
        prompt: "テスト用",
        schedule: ["午前9:00", "午前10:00"],
        stops: [
          { place: "テスト地点A", note: "", etiquette: [{ text: "tip A" }] },
          { place: "テスト地点B", note: "", etiquette: [{ text: "tip B" }] },
        ],
        etiquette: [{ text: "route-level tip" }],
      },
    ];

    const { result } = renderHook(() => usePlanState(customScenarios));

    expect(result.current.scenarios).toBe(customScenarios);
    expect(result.current.activeScenario.id).toBe("custom");
    expect(result.current.orderedStops.map((s) => s.stop.place)).toEqual(["テスト地点A", "テスト地点B"]);
  });
});
