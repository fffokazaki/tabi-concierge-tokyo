import type { DragEvent } from "react";
import { DataGapCard } from "./components/DataGapCard";
import { EtiquetteList } from "./components/EtiquetteList";
import { GapEscalationNote } from "./components/GapEscalationNote";
import { JntoReferenceNote } from "./components/JntoReferenceNote";
import { ProvenanceChip } from "./components/ProvenanceChip";
import { RouteStopCard } from "./components/RouteStopCard";
import { getJntoReference } from "./jntoEtiquette";
import type { PlanFailure } from "./buildPlan";
import type { PlanScreenState } from "./usePlanState";

/** ルートカードの並べ替えドラッグだけを受け付けるための独自 MIME タイプ。
 *  外部（他アプリのファイル・テキストなど）からのドロップと区別する。 */
const STOP_DRAG_MIME_TYPE = "application/x-tabi-stop";

export function PlanScreen({ state }: { state: PlanScreenState }) {
  const {
    request,
    orderedStops,
    hiddenStopNote,
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

  // JNTO 参考情報は選択中の停留地のカテゴリだけに出す（ADR-012）。停留地未選択（「このルートの
  // マナー」）のときは複数カテゴリが混在しうるため、特定の参考情報を出さない
  const selectedSource = orderedStops.find((s) => s.selected)?.source;
  const jntoReference = selectedSource ? getJntoReference(selectedSource.datasetId) : null;

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
          <>
            <div className="route-empty" role="status">
              <p className="route-empty__title">該当するオープンデータがありません</p>
              <p className="route-empty__message">{request.message}</p>
              {/* 分類は応答全体を代表する1つ（引き上げをしないので other になる。Issue #94）。
                  候補ごとに違う理由は次の DataGapCard で内訳として出す */}
              <p className="route-empty__reason">分類: {request.reason}</p>
            </div>
            {/* カードの**兄弟**として並べる（`ready` 分岐と同じ形）。route-empty の中に入れると、
                data-gap-card__title（15px）が親の route-empty__title（12.5px）より大きく、
                見出しの階層が逆転する */}
            {request.gaps.length > 0 && <DataGapCard gaps={request.gaps} />}
            {/* 内訳（gaps）が空でも出す（応答全体が unanswered のとき gaps は常に空）。
                reason で出し分けない理由は GapEscalationNote の doc */}
            <GapEscalationNote />
          </>
        )}

        {request.status === "failed" && <FailureNotice failure={request.failure} onRetry={() => void requestPlan()} />}

        {request.status === "ready" && (
          <>
            {request.gaps.length > 0 && <DataGapCard gaps={request.gaps} />}
            {request.gaps.length > 0 && <GapEscalationNote />}

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

            {/* 「該当データなし」（DataGapCard）とは原因が別（表示上限で伏せているだけ）なので、
                見た目も別要素にする。dashed の DataGapCard とは意図的にスタイルを変えている */}
            {hiddenStopNote && <p className="route-hidden-note">{hiddenStopNote}</p>}

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
                 「まだ無い」ではなく「調査済み・存在しないことを確認済み」と書く（Issue #67）。
                 カタログ外の出典で埋めることもしない（ADR-010）。文言は worker/core/search-gaps.ts の
                 etiquetteUnanswered と同じ語り口に揃えてある。
                 未選択のときだけ「停留地を選ぶと…」の誘導文を足す。選択中は JNTO ノートが
                 すぐ下に出るため誘導は不要（JNTO はカタログ出典ではないと誤読させないよう、
                 この一文はあくまで操作の案内であって出典の存在を示唆しない） */
              <p className="route-status">
                出典のあるマナー情報はありません。訪日観光客向けのマナー・作法の解説にあたるデータは、東京都オープンデータカタログに存在しないことを確認済みです（2026-08-17
                調査）。都へのデータ公開リクエストの候補として記録しています。
                {!jntoReference && "停留地を選ぶと、JNTOの参考情報を表示します。"}
              </p>
            )}

            {/* JNTO の参考情報は上記の誠実な空表示を置き換えない。両方見せる（ADR-012） */}
            {jntoReference && <JntoReferenceNote reference={jntoReference} />}
          </>
        )}
      </div>
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
  // 「接続できませんでした」（network）とは意図的に文言を分ける（Issue #146）。
  // サーバーには届いている可能性があり、原因を誤誘導しないため
  timeout: "応答がありませんでした",
};
