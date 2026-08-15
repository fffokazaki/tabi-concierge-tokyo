import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ADULTS_MAX, ADULTS_MIN } from "./constants";
import { usePlanState } from "./usePlanState";

describe("usePlanState", () => {
  it("clamps counters at their min/max bounds", () => {
    const { result } = renderHook(() => usePlanState());

    act(() => {
      for (let i = 0; i < ADULTS_MAX + 5; i++) result.current.bumpCounter("adults", 1, ADULTS_MIN, ADULTS_MAX);
    });
    expect(result.current.trip.adults).toBe(ADULTS_MAX);

    act(() => {
      for (let i = 0; i < ADULTS_MAX + 5; i++) result.current.bumpCounter("adults", -1, ADULTS_MIN, ADULTS_MAX);
    });
    expect(result.current.trip.adults).toBe(ADULTS_MIN);
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

  it("reorders stops by moving the dragged item to its drop position", () => {
    const { result } = renderHook(() => usePlanState());
    const originalPlaces = result.current.orderedStops.map((s) => s.stop.place);

    act(() => result.current.reorderStop(0, 2));

    const reorderedPlaces = result.current.orderedStops.map((s) => s.stop.place);
    expect(reorderedPlaces).toEqual([originalPlaces[1], originalPlaces[2], originalPlaces[0]]);
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
});
