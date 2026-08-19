import { useState } from "react";
import type { BuildPlanOptions } from "./buildPlan";
import { TripSetupScreen } from "./TripSetupScreen";
import { PlanScreen } from "./PlanScreen";
import { usePlanState } from "./usePlanState";
import type { BuildRecommendationsOptions } from "../foryou/buildRecommendations";
import { ForYouScreen } from "../foryou/ForYouScreen";
import { useForYouState } from "../foryou/useForYouState";

/**
 * スキャン・周辺の2画面はまだ実装していない（今回の対象外）。
 * タブバー自体は public/showcase/ の見た目に合わせて表示しつつ、押しても何も起きない
 * disabled 状態にしておく。存在しない画面への遷移を作らないため。
 */
const INACTIVE_TABS = [
  { key: "scan", label: "スキャン" },
  { key: "nearby", label: "周辺" },
] as const;

/**
 * プラン・あなたへの切り替え。`usePlanState` の `screen`（setup/briefing）とは別の軸。
 * `screen` を3値に広げず `AppTabs` 側にこの状態を足したのは、プランの十分にテスト済みの
 * 状態機械へ手を入れるリスクを避けるため（あなたへスコーピング計画 §5 と同じ判断）。
 */
type ActiveTab = "briefing" | "foryou";

/** @param options `buildPlan` / `buildRecommendations` への注入口。テストが fetch を差し替えるために使う。 */
export function AppTabs({ options }: { options?: BuildPlanOptions & BuildRecommendationsOptions } = {}) {
  const state = usePlanState(options);
  const forYouState = useForYouState(options);
  const { screen, goBriefing } = state;
  const [activeTab, setActiveTab] = useState<ActiveTab>("briefing");

  const goPlanTab = () => {
    goBriefing();
    setActiveTab("briefing");
  };
  const goForYouTab = () => setActiveTab("foryou");

  return (
    <div className="app-shell">
      {screen === "setup" ? (
        <TripSetupScreen state={state} />
      ) : activeTab === "foryou" ? (
        <ForYouScreen state={forYouState} />
      ) : (
        <PlanScreen state={state} />
      )}

      {screen !== "setup" && (
        <nav className="tab-bar">
          <button
            type="button"
            className={`tab-bar__item${activeTab === "briefing" ? " tab-bar__item--active" : ""}`}
            onClick={goPlanTab}
          >
            <PlanIcon />
            <span className="tab-bar__label">プラン</span>
          </button>
          {INACTIVE_TABS.map((tab) => (
            <button key={tab.key} type="button" className="tab-bar__item tab-bar__item--disabled" disabled>
              <PlaceholderIcon />
              <span className="tab-bar__label">{tab.label}</span>
            </button>
          ))}
          <button
            type="button"
            className={`tab-bar__item${activeTab === "foryou" ? " tab-bar__item--active" : ""}`}
            onClick={goForYouTab}
          >
            <ForYouIcon />
            <span className="tab-bar__label">あなたへ</span>
          </button>
        </nav>
      )}
    </div>
  );
}

function PlanIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect x="2" y="3" width="16" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7 14l-1.5 3.5L9 14" fill="currentColor" />
    </svg>
  );
}

function ForYouIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <rect
        x="6.5"
        y="6.5"
        width="7"
        height="7"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        transform="rotate(45 10 10)"
      />
    </svg>
  );
}

function PlaceholderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
