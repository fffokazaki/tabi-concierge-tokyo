import { useState } from "react";
import { DEFAULT_TRIP, STOP_COUNT_BY_PACE } from "./constants";
import { MOCK_SCENARIOS } from "./mockScenarios";
import type { InterestTag, Scenario, Screen, Stop, Trip } from "./types";

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
 * 子ども連れは最優先で family へ。次に、選択された興味のいずれかが一致するシナリオへ
 * （シナリオ自身の interest フィールドを見るため、"ナイトライフ" 以外の興味を追加しても
 * この関数を書き換えずに拾える）。どれにも一致しなければ ramen（無ければ先頭）へ。
 *
 * ramen 自身はマッチング対象から除外する。ramen の interest（"ラーメン"）は
 * DEFAULT_TRIP で最初から選択済みのため、除外しないと他の興味（例: ナイトライフ）を
 * 追加で選んでも常に ramen が先に一致してしまう（ramen は「フォールバック」の
 * 役割であって、他と対等な「一致候補」ではないため）。
 */
function pickScenarioId(trip: Trip, scenarios: Scenario[]): string {
  if (trip.kids > 0) {
    const family = scenarios.find((s) => s.id === "family");
    if (family) return family.id;
  }
  const fallbackId = scenarios.some((s) => s.id === "ramen") ? "ramen" : scenarios[0].id;
  const matched = scenarios.find((s) => s.id !== fallbackId && s.interest && trip.interests.includes(s.interest));
  return matched ? matched.id : fallbackId;
}

export function usePlanState(scenarios: Scenario[] = MOCK_SCENARIOS) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [trip, setTripState] = useState<Trip>(DEFAULT_TRIP);
  const [scenarioId, setScenarioId] = useState<string>(scenarios[0].id);
  const [stopOrder, setStopOrder] = useState<Record<string, number[]>>({});
  const [selectedStop, setSelectedStop] = useState<Record<string, number | null>>({});
  const [dragPos, setDragPos] = useState<number | null>(null);

  const activeScenario = scenarios.find((s) => s.id === scenarioId) ?? scenarios[0];
  // 並べ替えは全停留地分保持するが、表示するのはペースに応じた件数だけ（隠れた分の並び順は失わない）。
  const order = stopOrder[scenarioId] ?? activeScenario.stops.map((_, i) => i);
  const visibleCount = Math.min(STOP_COUNT_BY_PACE[trip.pace], activeScenario.stops.length);
  const visibleOrder = order.slice(0, visibleCount);
  const selIdx = selectedStop[scenarioId] ?? null;
  const selectedStopData = selIdx != null ? activeScenario.stops[selIdx] : null;

  const orderedStops: OrderedStop[] = visibleOrder.map((origIdx, pos) => ({
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
  const selectScenario = (id: string) => setScenarioId(id);

  const selectStop = (origIdx: number) =>
    setSelectedStop((s) => ({ ...s, [scenarioId]: s[scenarioId] === origIdx ? null : origIdx }));

  const clearStopSelection = () => setSelectedStop((s) => ({ ...s, [scenarioId]: null }));

  /**
   * ドラッグ&ドロップの並べ替え結果を反映する。呼び出し元（PlanScreen）は
   * カスタム MIME タイプでドラッグ元を絞り込んでいるが、fromPos/toPos は外部から
   * 渡ってくる値（dataTransfer 経由）なので、ここでも独立に整数・範囲チェックを行う。
   * 不正な値は無視し、順序は変更しない。
   *
   * 範囲は order.length ではなく visibleCount（画面に出ている件数）で判定する。
   * ペースが「ゆったり」等で一部の停留地が非表示のとき、その隠れた停留地の位置へ
   * ドラッグできてしまうのを防ぐため（隠れている停留地は並べ替えの対象外）。
   */
  const reorderStop = (fromPos: number, toPos: number) => {
    const isValidPos = (pos: number) => Number.isInteger(pos) && pos >= 0 && pos < visibleCount;
    if (!isValidPos(fromPos) || !isValidPos(toPos)) {
      console.warn(`reorderStop: 不正な位置を無視しました（fromPos=${fromPos}, toPos=${toPos}, 有効範囲=0-${visibleCount - 1}）`);
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
