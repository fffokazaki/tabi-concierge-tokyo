import { JntoReferenceNote } from "../../plan/components/JntoReferenceNote";
import { getJntoReference } from "../../plan/jntoEtiquette";
import { ProvenanceChip } from "../../plan/components/ProvenanceChip";
import type { Recommendation } from "../types";

/**
 * レコメンドカード1件。
 *
 * デザインカンプ（`05-あなたへ`）にある写真枠（`image-slot`）は実装しない。
 * 確定10データセットに画像・写真URLを持つものが無く（`worker/core/catalog.ts` 実測）、
 * 実装するとカンプと実際の仕組みがずれる（`DataGapCard` がボタン・件数表示を省いたのと同じ判断）。
 *
 * `reason`（◆ タグ）が無い場合（「すべて」で複数興味をまとめて問い合わせたとき）は行ごと出さない。
 * 確信の持てない理由付けをするくらいなら、理由を言わない方を選ぶ。
 */
export function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const { name, blurb, reason, source } = recommendation;

  return (
    <div className="recommendation-card">
      {reason && (
        <div className="recommendation-card__reason">
          <span className="recommendation-card__reason-mark" aria-hidden="true" />
          {reason}
        </div>
      )}
      <div className="recommendation-card__name">{name}</div>
      <div className="recommendation-card__blurb">{blurb}</div>
      <ProvenanceChip source={source} />
      {/* 出典（CC BY・上の ProvenanceChip）とは別物。JNTO の「参考」情報は置き換えではなく追加（ADR-012） */}
      <JntoReferenceNote reference={getJntoReference(source.datasetId)} />
    </div>
  );
}
