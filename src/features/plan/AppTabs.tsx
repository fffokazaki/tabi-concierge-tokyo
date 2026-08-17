import type { BuildPlanOptions } from "./buildPlan";
import { TripSetupScreen } from "./TripSetupScreen";
import { PlanScreen } from "./PlanScreen";
import { usePlanState } from "./usePlanState";

/**
 * スキャン・周辺・あなたへの3画面はまだ実装していない（今回の対象外）。
 * タブバー自体は public/showcase/ の見た目に合わせて表示しつつ、押しても何も起きない
 * disabled 状態にしておく。存在しない画面への遷移を作らないため。
 */
const INACTIVE_TABS = [
  { key: "scan", label: "スキャン" },
  { key: "nearby", label: "周辺" },
  { key: "foryou", label: "あなたへ" },
] as const;

/** @param options `buildPlan` への注入口。テストが fetch を差し替えるために使う。 */
export function AppTabs({ options }: { options?: BuildPlanOptions } = {}) {
  const state = usePlanState(options);
  const { screen, goBriefing } = state;

  return (
    <div className="app-shell">
      {screen === "setup" ? <TripSetupScreen state={state} /> : <PlanScreen state={state} />}

      {screen !== "setup" && (
        <nav className="tab-bar">
          <button type="button" className="tab-bar__item tab-bar__item--active" onClick={goBriefing}>
            <PlanIcon />
            <span className="tab-bar__label">プラン</span>
          </button>
          {INACTIVE_TABS.map((tab) => (
            <button key={tab.key} type="button" className="tab-bar__item tab-bar__item--disabled" disabled>
              <PlaceholderIcon />
              <span className="tab-bar__label">{tab.label}</span>
            </button>
          ))}
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

function PlaceholderIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
