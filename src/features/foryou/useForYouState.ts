import { useRef, useState } from "react";
import type { Unanswered, UnansweredReason } from "../../../shared/core";
import {
  buildRecommendations,
  type BuildRecommendationsOptions,
  type RecommendationFailure,
} from "./buildRecommendations";
import type { ActiveInterest, Recommendation } from "./types";

/**
 * あなたへ画面の状態（スコーピング計画 §5）。
 *
 * `usePlanState` とは意図的に分離している。プランの内部状態（並べ替え・ドラッグ&ドロップ・
 * ペース別表示件数）はここに一切持ち込まず、混ぜることで十分にテスト済みのプラン側の
 * 状態機械へリスクを持ち込まないようにする。
 *
 * `unanswered` と `failed` を型で分ける理由は `usePlanState.ts` の `PlanRequestState` と同じ
 * （「該当するオープンデータがありません」は正常な結果で、通信断とは別物）。
 */
export type ForYouRequestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; recommendations: Recommendation[]; gaps: Unanswered[] }
  | { status: "unanswered"; reason: UnansweredReason; message: string }
  | { status: "failed"; failure: RecommendationFailure };

/**
 * @param options `buildRecommendations` への注入口。テストが fetch を差し替えるために使う。
 */
export function useForYouState(options: BuildRecommendationsOptions = {}) {
  const [activeInterest, setActiveInterestState] = useState<ActiveInterest>("all");
  const [request, setRequest] = useState<ForYouRequestState>({ status: "idle" });
  /** 連打で古い応答があとから届いたときに、新しい結果を古いもので上書きしないためのガード */
  const latestRequest = useRef(0);

  const load = async (interest: ActiveInterest) => {
    const id = ++latestRequest.current;
    setRequest({ status: "loading" });

    const outcome = await buildRecommendations(interest, options);
    if (id !== latestRequest.current) return;

    setRequest(
      outcome.kind === "recommendations"
        ? { status: "ready", recommendations: outcome.recommendations, gaps: outcome.gaps }
        : outcome.kind === "unanswered"
          ? { status: "unanswered", reason: outcome.reason, message: outcome.message }
          : { status: "failed", failure: outcome.failure },
    );
  };

  const setActiveInterest = (interest: ActiveInterest) => {
    setActiveInterestState(interest);
    void load(interest);
  };

  /** タブへ最初に入ったときに呼ぶ。画面遷移のたびに何度呼んでも安全（連打ガードと同じ仕組み）。 */
  const ensureLoaded = () => {
    if (request.status === "idle") void load(activeInterest);
  };

  const retry = () => void load(activeInterest);

  return { activeInterest, request, setActiveInterest, ensureLoaded, retry };
}

export type ForYouState = ReturnType<typeof useForYouState>;
