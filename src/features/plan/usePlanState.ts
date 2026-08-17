import { useState } from "react";
import { DEFAULT_TRIP } from "./constants";
import { INTEREST_LABELS, PACE_LABELS } from "./labels";
import { MOCK_SCENARIOS } from "./mockScenarios";
import type { InterestTag, Scenario, ScenarioId, Screen, Stop, Trip } from "./types";

type CounterKey = "adults" | "kids" | "days";

export type OrderedStop = {
  origIdx: number;
  pos: number;
  stop: Stop;
  /** activeScenario.schedule[pos] 由来。pos（並べ替え後の位置）に紐づき、stop 自体には持たせない。 */
  time: string;
  selected: boolean;
  isDragOver: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * trip.kids / trip.interests からブリーフィング画面の初期シナリオを選ぶ。
 * プロトタイプの saveTrip と同じ規則。
 *
 * 判定に使うのはドメイン値（ASCII の識別子）で、表示ラベルではない（Issue #17）。
 * 以前は `trip.interests.includes("ナイトライフ")` と日本語リテラルで分岐しており、
 * ラベルを英語に切り替えた瞬間に分岐が死ぬ形だった。
 */
function pickScenarioId(trip: Trip, scenarios: Scenario[]): ScenarioId {
  const fallback = scenarios[0].id;
  if (trip.kids > 0 && scenarios.some((s) => s.id === "family")) return "family";
  if (trip.interests.includes("nightlife") && scenarios.some((s) => s.id === "nightlife")) return "nightlife";
  return scenarios.some((s) => s.id === "ramen") ? "ramen" : fallback;
}

export function usePlanState(scenarios: Scenario[] = MOCK_SCENARIOS) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [trip, setTripState] = useState<Trip>(DEFAULT_TRIP);
  const [scenarioId, setScenarioId] = useState<ScenarioId>(scenarios[0].id);
  const [stopOrder, setStopOrder] = useState<Partial<Record<ScenarioId, number[]>>>({});
  const [selectedStop, setSelectedStop] = useState<Partial<Record<ScenarioId, number | null>>>({});
  const [dragPos, setDragPos] = useState<number | null>(null);

  const activeScenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  const order = stopOrder[scenarioId] ?? activeScenario.stops.map((_, i) => i);
  const selIdx = selectedStop[scenarioId] ?? null;
  const selectedStopData = selIdx != null ? activeScenario.stops[selIdx] : null;

  const orderedStops: OrderedStop[] = order.map((origIdx, pos) => ({
    origIdx,
    pos,
    stop: activeScenario.stops[origIdx],
    time: activeScenario.schedule[pos],
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
  /** `ScenarioId` union なので、存在しない id を渡すとコンパイルエラーになる（Issue #17）。 */
  const selectScenario = (id: ScenarioId) => setScenarioId(id);

  const selectStop = (origIdx: number) =>
    setSelectedStop((s) => ({ ...s, [scenarioId]: s[scenarioId] === origIdx ? null : origIdx }));

  const clearStopSelection = () => setSelectedStop((s) => ({ ...s, [scenarioId]: null }));

  /**
   * ドラッグ&ドロップの並べ替え結果を反映する。呼び出し元（PlanScreen）は
   * カスタム MIME タイプでドラッグ元を絞り込んでいるが、fromPos/toPos は外部から
   * 渡ってくる値（dataTransfer 経由）なので、ここでも独立に整数・範囲チェックを行う。
   * 不正な値は無視し、順序は変更しない。
   */
  const reorderStop = (fromPos: number, toPos: number) => {
    const isValidPos = (pos: number) => Number.isInteger(pos) && pos >= 0 && pos < order.length;
    if (!isValidPos(fromPos) || !isValidPos(toPos)) {
      console.warn(`reorderStop: 不正な位置を無視しました（fromPos=${fromPos}, toPos=${toPos}, 有効範囲=0-${order.length - 1}）`);
      return;
    }
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
  // 表示はドメイン値そのものではなくラベル越しに引く。値を直接埋めると "balanced" が画面に出る
  const tripSummary = `大人${trip.adults}名・子ども${trip.kids}名・${trip.days}日間・${PACE_LABELS[trip.pace]}・${
    trip.interests
      .slice(0, 2)
      .map((tag) => INTEREST_LABELS[tag])
      .join("、") || "未選択"
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

/** TripSetupScreen が実際に使うフィールドだけに絞った型。全量の PlanState を渡しても構造的に満たされる。 */
export type TripSetupState = Pick<PlanState, "trip" | "bumpCounter" | "setTrip" | "toggleInterest" | "saveTrip">;

/** PlanScreen が実際に使うフィールドだけに絞った型。 */
export type PlanScreenState = Pick<
  PlanState,
  | "scenarios"
  | "activeScenario"
  | "orderedStops"
  | "selectedStopData"
  | "displayedEtiquette"
  | "etiquetteTitle"
  | "tripSummary"
  | "goSetup"
  | "selectScenario"
  | "selectStop"
  | "clearStopSelection"
  | "reorderStop"
  | "setDragOverPos"
>;
