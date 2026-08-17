import { useRef, useState } from "react";
import type { Unanswered, UnansweredReason } from "../../../shared/core";
import { buildPlan, type BuildPlanOptions, type PlanFailure, type SourcedStop } from "./buildPlan";
import { DEFAULT_TRIP, STOP_COUNT_BY_PACE } from "./constants";
import { INTEREST_LABELS, PACE_LABELS } from "./labels";
import type { InterestTag, Screen, Trip } from "./types";

type CounterKey = "adults" | "kids" | "days";

/**
 * ルート組み立ての状態（Issue #31）。
 *
 * **`unanswered` と `failed` を型で分けてある。** 「該当するオープンデータがありません」は
 * 正常な結果（API.md §4・DOMAIN.md §8 不変条件4）で、通信断や 500 とは別物。
 * 1つの `error` にまとめると、データが無いことが障害として表示され、欠損が見えなくなる。
 *
 * 仮データへ戻す状態は**持たない**。応答が無いときに既定のルートを見せる経路を作ると、
 * 出典なしの内容が出典つきに見える（[ACE-28-1](../../../docs/08-knowledge/playbook/architecture.md#ace-28-1)）。
 */
export type PlanRequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; query: string; stops: SourcedStop[]; gaps: Unanswered[] }
  | { status: "unanswered"; reason: UnansweredReason; message: string }
  | { status: "failed"; failure: PlanFailure };

export type OrderedStop = {
  origIdx: number;
  pos: number;
  stop: SourcedStop["stop"];
  source: SourcedStop["source"];
  /** 表示用の順番ラベル。pos（並べ替え後の位置）から導出され、stop 自体には持たせない。 */
  positionLabel: string;
  selected: boolean;
  isDragOver: boolean;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param options `buildPlan` への注入口。テストが fetch を差し替えるために使う。
 */
export function usePlanState(options: BuildPlanOptions = {}) {
  const [screen, setScreen] = useState<Screen>("setup");
  const [trip, setTripState] = useState<Trip>(DEFAULT_TRIP);
  const [request, setRequest] = useState<PlanRequestState>({ status: "idle" });
  /** null は「並べ替えていない（応答の順）」。新しいルートが来たら null に戻す */
  const [order, setOrder] = useState<number[] | null>(null);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [dragPos, setDragPos] = useState<number | null>(null);
  /**
   * 進行中のリクエストの通し番号。連打で古い応答があとから届いたときに、
   * 新しいルートを古いもので上書きしないためのガード。
   */
  const latestRequest = useRef(0);

  const stops = request.status === "ready" ? request.stops : [];
  // 並べ替えは応答全件分保持するが、表示するのはペースに応じた件数だけ（隠れた分の並び順は失わない）。
  // reorderStop の範囲判定・splice の基点はどちらも「表示中の件数」を自然に使う形になっている
  // （下記参照）ため、ここでスライスするだけで両方に正しく効く。
  const visibleCount = Math.min(STOP_COUNT_BY_PACE[trip.pace], stops.length);
  const effectiveOrder = (order ?? stops.map((_, i) => i)).slice(0, visibleCount);
  const selectedStopData = selectedIdx != null ? (stops[selectedIdx]?.stop ?? null) : null;

  const orderedStops: OrderedStop[] = effectiveOrder.map((origIdx, pos) => ({
    origIdx,
    pos,
    stop: stops[origIdx].stop,
    source: stops[origIdx].source,
    positionLabel: `${pos + 1}番目`,
    selected: selectedIdx === origIdx,
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

  /** コア3操作を呼んでルートを組み立て直す。並べ替え・選択はリセットする。 */
  const requestPlan = async () => {
    const id = ++latestRequest.current;
    setRequest({ status: "loading" });
    setOrder(null);
    setSelectedIdx(null);
    setDragPos(null);

    const outcome = await buildPlan(trip, options);
    // 後発のリクエストに追い越されていたら、古い応答は捨てる
    if (id !== latestRequest.current) return;

    setRequest(
      outcome.kind === "plan"
        ? { status: "ready", query: outcome.query, stops: outcome.stops, gaps: outcome.gaps }
        : outcome.kind === "unanswered"
          ? { status: "unanswered", reason: outcome.reason, message: outcome.message }
          : { status: "failed", failure: outcome.failure },
    );
  };

  const saveTrip = () => {
    setScreen("briefing");
    void requestPlan();
  };

  const goSetup = () => setScreen("setup");
  const goBriefing = () => setScreen("briefing");

  const selectStop = (origIdx: number) => setSelectedIdx((current) => (current === origIdx ? null : origIdx));

  const clearStopSelection = () => setSelectedIdx(null);

  /**
   * ドラッグ&ドロップの並べ替え結果を反映する。呼び出し元（PlanScreen）は
   * カスタム MIME タイプでドラッグ元を絞り込んでいるが、fromPos/toPos は外部から
   * 渡ってくる値（dataTransfer 経由）なので、ここでも独立に整数・範囲チェックを行う。
   * 不正な値は無視し、順序は変更しない。
   */
  const reorderStop = (fromPos: number, toPos: number) => {
    const isValidPos = (pos: number) => Number.isInteger(pos) && pos >= 0 && pos < effectiveOrder.length;
    if (!isValidPos(fromPos) || !isValidPos(toPos)) {
      console.warn(
        `reorderStop: 不正な位置を無視しました（fromPos=${fromPos}, toPos=${toPos}, 有効範囲=0-${effectiveOrder.length - 1}）`,
      );
      return;
    }
    if (fromPos === toPos) return;
    setOrder((current) => {
      const next = [...(current ?? stops.map((_, i) => i))];
      const [moved] = next.splice(fromPos, 1);
      next.splice(toPos, 0, moved);
      return next;
    });
  };

  const setDragOverPos = (pos: number | null) => setDragPos(pos);

  const displayedEtiquette = selectedStopData ? selectedStopData.etiquette : [];
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
    request,
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
    requestPlan,
    goSetup,
    goBriefing,
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
  | "request"
  | "orderedStops"
  | "selectedStopData"
  | "displayedEtiquette"
  | "etiquetteTitle"
  | "tripSummary"
  | "goSetup"
  | "requestPlan"
  | "selectStop"
  | "clearStopSelection"
  | "reorderStop"
  | "setDragOverPos"
>;
