import type { DragEvent } from "react";
import type { Unanswered } from "../../../shared/core";
import { EtiquetteList } from "./components/EtiquetteList";
import { ProvenanceChip } from "./components/ProvenanceChip";
import { RouteStopCard } from "./components/RouteStopCard";
import type { PlanFailure } from "./buildPlan";
import type { PlanScreenState } from "./usePlanState";

/** ルートカードの並べ替えドラッグだけを受け付けるための独自 MIME タイプ。
 *  外部（他アプリのファイル・テキストなど）からのドロップと区別する。 */
const STOP_DRAG_MIME_TYPE = "application/x-tabi-stop";

export function PlanScreen({ state }: { state: PlanScreenState }) {
  const {
    request,
    orderedStops,
    selectedStopData,
    displayedEtiquette,
    etiquetteTitle,
    tripSummary,
    goSetup,
    requestPlan,
    selectStop,
    clearStopSelection,
    reorderStop,
    setDragOverPos,
  } = state;

  const handleDragStart = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(STOP_DRAG_MIME_TYPE, String(pos));
  };

  // ルートカード由来のドラッグだけ preventDefault してドロップ可能にする。
  // 外部ドラッグ（ファイル等）は preventDefault しないので、ブラウザ標準の
  // 「ドロップ不可」表示のままになる。
  const handleDragOver = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(STOP_DRAG_MIME_TYPE)) return;
    e.preventDefault();
    setDragOverPos(pos);
  };

  const handleDrop = (pos: number) => (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(STOP_DRAG_MIME_TYPE)) return;
    e.preventDefault();
    const fromPos = Number(e.dataTransfer.getData(STOP_DRAG_MIME_TYPE));
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

      {request.status === "ready" && <div className="chat-bubble">「{request.query}」</div>}

      <div className="route-panel">
        <div className="route-panel__header">
          <span className="route-panel__header-dot" aria-hidden="true" />
          <span className="route-panel__header-label">あなたのルート</span>
        </div>

        {request.status === "loading" && (
          <p className="route-status" role="status">
            オープンデータを探しています…
          </p>
        )}

        {request.status === "idle" && (
          <p className="route-status">旅のプロフィールから「ブリーフィングを作成」を押してください。</p>
        )}

        {/* 「該当するオープンデータがありません」は正常な結果。エラー表示にしない（API.md §4） */}
        {request.status === "unanswered" && (
          <div className="route-empty" role="status">
            <p className="route-empty__title">該当するオープンデータがありません</p>
            <p className="route-empty__message">{request.message}</p>
            <p className="route-empty__reason">分類: {request.reason}</p>
          </div>
        )}

        {request.status === "failed" && <FailureNotice failure={request.failure} onRetry={() => void requestPlan()} />}

        {request.status === "ready" && (
          <>
            {request.gaps.length > 0 && <GapNotice gaps={request.gaps} />}

            {orderedStops.map(({ origIdx, pos, stop, source, positionLabel, selected, isDragOver }) => (
              <div key={origIdx} className="route-stop">
                <RouteStopCard
                  stop={stop}
                  time={positionLabel}
                  selected={selected}
                  isDragOver={isDragOver}
                  onSelect={() => selectStop(origIdx)}
                  onDragStart={handleDragStart(pos)}
                  onDragOver={handleDragOver(pos)}
                  onDrop={handleDrop(pos)}
                  onDragEnd={() => setDragOverPos(null)}
                />
                {/* 出典は停留地ごとに必ず1つ。出典の取れなかった内容は buildPlan が落としている */}
                <ProvenanceChip source={source} />
              </div>
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
            {displayedEtiquette.length > 0 ? (
              <EtiquetteList tips={displayedEtiquette} />
            ) : (
              /* 仮のマナー文を出すのは出典なしの回答にあたる（CLAUDE.md 絶対ルール #2）。
                 出典のあるデータを確保するまでは、無いことをそのまま書く。Issue #43 */
              <p className="route-status">
                出典のあるマナー情報はまだありません。カタログに該当データを確認できていないためです。
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 答えられなかった興味の表示（Issue #29 の `gaps`）。
 *
 * エラー扱いにしない。データが無いことは正常な出力で、「どのデータが公開されていないか」を
 * 見せること自体が企画の芯にあたる（DOMAIN.md §7）。
 */
function GapNotice({ gaps }: { gaps: Unanswered[] }) {
  return (
    <div className="route-gaps" role="status">
      <p className="route-gaps__title">一部の興味には答えられませんでした</p>
      <ul className="route-gaps__list">
        {gaps.map((gap) => (
          <li key={`${gap.reason}:${gap.message}`}>{gap.message}</li>
        ))}
      </ul>
    </div>
  );
}

/** 障害の表示。`unanswered`（データが無い）とは見た目から区別する。 */
function FailureNotice({ failure, onRetry }: { failure: PlanFailure; onRetry: () => void }) {
  return (
    <div className="route-failure" role="alert">
      <p className="route-failure__title">{FAILURE_TITLES[failure.kind]}</p>
      <p className="route-failure__detail">{failure.detail}</p>
      {failure.kind !== "input" && (
        <button type="button" className="route-failure__retry" onClick={onRetry}>
          再試行
        </button>
      )}
    </div>
  );
}

/**
 * 障害の種別ごとの見出し。まとめて「エラーが発生しました」にすると、原因と逆方向へ
 * 利用者を誘導する（health.ts / Issue #14 と同じ方針）。
 */
const FAILURE_TITLES: Record<PlanFailure["kind"], string> = {
  input: "入力が足りません",
  network: "サーバーに接続できませんでした",
  http: "サーバーがエラーを返しました",
  parse: "応答を読み取れませんでした",
};
