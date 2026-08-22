import { useEffect } from "react";
import { DataGapCard } from "../plan/components/DataGapCard";
import { FORYOU_INTEREST_TAGS } from "./constants";
import { InterestFilterChips } from "./components/InterestFilterChips";
import { RecommendationCard } from "./components/RecommendationCard";
import type { RecommendationFailure } from "./buildRecommendations";
import type { ForYouState } from "./useForYouState";

export function ForYouScreen({ state }: { state: ForYouState }) {
  const { activeInterest, request, setActiveInterest, ensureLoaded, retry } = state;

  // タブへ入った最初の1回だけ読み込む。ensureLoaded は idle のときしか動かないので、
  // 画面が再マウントされない限りチップ切り替え時の再実行とは競合しない。
  // 依存配列は意図的に空（マウント時の1回のみで、ensureLoaded 自体は毎レンダー新しい参照になる）
  useEffect(() => {
    ensureLoaded();
  }, []);

  return (
    <div className="screen">
      <div className="screen-header__top">
        <div className="eyebrow">あなたへ</div>
        <div className="ai-badge">
          <span className="ai-badge__dot" aria-hidden="true" />
          <span className="ai-badge__label">パーソナライズ</span>
        </div>
      </div>
      <div className="screen-header__title">興味に基づくおすすめ</div>

      <InterestFilterChips options={FORYOU_INTEREST_TAGS} active={activeInterest} onSelect={setActiveInterest} />

      <div className="route-panel">
        {request.status === "loading" && (
          <p className="route-status" role="status">
            おすすめを探しています…
          </p>
        )}

        {request.status === "idle" && <p className="route-status">読み込みを準備しています…</p>}

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
          </>
        )}

        {request.status === "failed" && <FailureNotice failure={request.failure} onRetry={retry} />}

        {request.status === "ready" && (
          <>
            {request.gaps.length > 0 && <DataGapCard gaps={request.gaps} />}
            {request.recommendations.map((recommendation) => (
              <RecommendationCard key={recommendation.source.datasetId} recommendation={recommendation} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 障害の表示。`unanswered`（データが無い）とは見た目から区別する（PlanScreen.tsx の
 * FailureNotice と同じ方針。あなたへ独自に持つ理由は buildRecommendations.ts 冒頭コメント参照）。
 */
function FailureNotice({ failure, onRetry }: { failure: RecommendationFailure; onRetry: () => void }) {
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

const FAILURE_TITLES: Record<RecommendationFailure["kind"], string> = {
  input: "入力が足りません",
  network: "サーバーに接続できませんでした",
  http: "サーバーがエラーを返しました",
  parse: "応答を読み取れませんでした",
  // 「接続できませんでした」（network）とは意図的に文言を分ける（Issue #146）。
  // サーバーには届いている可能性があり、原因を誤誘導しないため
  timeout: "応答がありませんでした",
};
