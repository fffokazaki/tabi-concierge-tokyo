import type { DragEvent } from "react";
import { RouteStopCard } from "./components/RouteStopCard";
import { EtiquetteList } from "./components/EtiquetteList";
import type { PlanState } from "./usePlanState";

export function PlanScreen({ state }: { state: PlanState }) {
  const {
    scenarios,
    activeScenario,
    orderedStops,
    selectedStopData,
    displayedEtiquette,
    etiquetteTitle,
    tripSummary,
    goSetup,
    selectScenario,
    selectStop,
    clearStopSelection,
    reorderStop,
    setDragOverPos,
  } = state;

  const handleDragStart = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(pos));
  };

  const handleDragOver = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverPos(pos);
  };

  const handleDrop = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const fromPos = Number(e.dataTransfer.getData("text/plain"));
    reorderStop(fromPos, pos);
    setDragOverPos(null);
  };

  return (
    <div className="screen">
      <button type="button" className="trip-summary-bar" onClick={goSetup}>
        <span className="trip-summary-bar__text">{tripSummary}</span>
        <span className="trip-summary-bar__edit">編集</span>
      </button>

      <div className="screen-header__top">
        <div className="eyebrow">AI旅程プランナー</div>
        <div className="ai-badge">
          <span className="ai-badge__dot" aria-hidden="true" />
          <span className="ai-badge__label">AI</span>
        </div>
      </div>
      <div className="screen-header__title">現地の知識で明日を計画しよう。</div>
      <p className="screen-header__lead">ご予定と興味を教えてください。マナーの解説付きでルートを作成します。</p>

      <div className="scenario-chips">
        {scenarios.map((scenario) => (
          <button
            key={scenario.id}
            type="button"
            className={`chip${scenario.id === activeScenario.id ? " chip--active" : ""}`}
            onClick={() => selectScenario(scenario.id)}
          >
            {scenario.label}
          </button>
        ))}
      </div>

      <div className="chat-bubble">{activeScenario.prompt}</div>

      <div className="route-panel">
        <div className="route-panel__header">
          <span className="route-panel__header-dot" aria-hidden="true" />
          <span className="route-panel__header-label">あなたのルート</span>
        </div>

        {orderedStops.map(({ origIdx, pos, stop, selected, isDragOver }) => (
          <RouteStopCard
            key={origIdx}
            stop={stop}
            selected={selected}
            isDragOver={isDragOver}
            onSelect={() => selectStop(origIdx)}
            onDragStart={handleDragStart(pos)}
            onDragOver={handleDragOver(pos)}
            onDrop={handleDrop(pos)}
            onDragEnd={() => setDragOverPos(null)}
          />
        ))}

        <div className="route-divider" />
        <div className="route-panel__section-header">
          <span className="route-panel__section-title">{etiquetteTitle}</span>
          {selectedStopData && (
            <button type="button" className="route-panel__clear" onClick={clearStopSelection}>
              すべて表示
            </button>
          )}
        </div>
        <EtiquetteList tips={displayedEtiquette} />
      </div>
    </div>
  );
}
