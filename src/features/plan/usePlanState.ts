import { useState } from "react";
import { DEFAULT_TRIP } from "./constants";
import { MOCK_SCENARIOS } from "./mockScenarios";
import type { InterestTag, Scenario, Screen, Stop, Trip } from "./types";

type CounterKey = "adults" | "kids" | "days";

export type OrderedStop = {
  origIdx: number;
  pos: number;
  stop: Stop;
  selected: boolean;
  isDragOver: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** trip.kids / trip.interests からブリーフィング画面の初期シナリオを選ぶ。プロトタイプの saveTrip と同じ規則。 */
function pickScenarioId(trip: Trip, scenarios: Scenario[]): string {
  const fallback = scenarios[0].id;
  if (trip.kids > 0 && scenarios.some((s) => s.id === "family")) return "family";
  if (trip.interests.includes("ナイトライフ") && scenarios.some((s) => s.id === "nightlife")) return "nightlife";
  return scenarios.some((s) => s.id === "ramen") ? "ramen" : fallback;
}

export function usePlanState(scenarios: Scenario[] = MOCK_SCENARIOS) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [trip, setTripState] = useState<Trip>(DEFAULT_TRIP);
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0].id);
  const [stopOrder, setStopOrder] = useState<Record<string, number[]>>({});
  const [selectedStop, setSelectedStop] = useState<Record<string, number | null>>({});
  const [dragPos, setDragPos] = useState<number | null>(null);

  const activeScenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const order = stopOrder[scenarioId] ?? activeScenario.stops.map((_, i) => i);
  const selIdx = selectedStop[scenarioId] ?? null;
  const selectedStopData = selIdx != null ? activeScenario.stops[selIdx] : null;

  const orderedStops: OrderedStop[] = order.map((origIdx, pos) => ({
    origIdx,
    pos,
    stop: activeScenario.stops[origIdx],
    selected: selIdx === origIdx,
    isDragOver: dragPos === pos,
  }));

  const setTrip = <K extends keyof Trip>(key: K, value: Trip[K]) =>
    setTripState((t) => ({ ...t, [key]: value }));

  const bumpCounter = (key: CounterKey, delta: number, min: number, max: number) =>
    setTripState((t) => ({ ...t, [key]: clamp(t[key] + delta, min, max) }));

  const toggleInterest = (tag: InterestTag) =>
    setTripState((t) => ({
      ...t,
      interests: t.interests.includes(tag) ? t.interests.filter((i) => i !== tag) : [...t.interests, tag],
    }));

  const saveTrip = () => {
    setScenarioId(pickScenarioId(trip, scenarios));
    setScreen("briefing");
  };

  const goSetup = () => setScreen("setup");
  const goBriefing = () => setScreen("briefing");
  const selectScenario = (id: string) => setScenarioId(id);

  const selectStop = (origIdx: number) =>
    setSelectedStop((s) => ({ ...s, [scenarioId]: s[scenarioId] === origIdx ? null : origIdx }));

  const clearStopSelection = () => setSelectedStop((s) => ({ ...s, [scenarioId]: null }));

  const reorderStop = (fromPos: number, toPos: number) => {
    if (fromPos === toPos) return;
    setStopOrder((s) => {
      const currentOrder = s[scenarioId] ?? activeScenario.stops.map((_, i) => i);
      const nextOrder = [...currentOrder];
      const [moved] = nextOrder.splice(fromPos, 1);
      nextOrder.splice(toPos, 0, moved);
      return { ...s, [scenarioId]: nextOrder };
    });
  };

  const setDragOverPos = (pos: number | null) => setDragPos(pos);

  const displayedEtiquette = selectedStopData ? selectedStopData.etiquette : activeScenario.etiquette;
  const etiquetteTitle = selectedStopData ? `${selectedStopData.place}のマナー` : "このルートのマナー";
  const tripSummary = `大人${trip.adults}名・子ども${trip.kids}名・${trip.days}日間・${trip.pace}・${
    trip.interests.slice(0, 2).join("、") || "未選択"
  }`;

  return {
    screen,
    trip,
    scenarios,
    activeScenario,
    orderedStops,
    selectedStopData,
    displayedEtiquette,
    etiquetteTitle,
    tripSummary,
    dragPos,
    setTrip,
    bumpCounter,
    toggleInterest,
    saveTrip,
    goSetup,
    goBriefing,
    selectScenario,
    selectStop,
    clearStopSelection,
    reorderStop,
    setDragOverPos,
  };
}

export type PlanState = ReturnType<typeof usePlanState>;
