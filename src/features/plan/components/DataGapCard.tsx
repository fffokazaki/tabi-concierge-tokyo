import type { DataGap } from "../types";

/**
 * 承認済みデザインカンプ（public/showcase/uploads/Gap_Design_new_jap.pdf）の
 * 「ラーメンの代わりに」カードを実装したもの。ボタンは静的表示のみで送信先が無い
 * （report_gap が未実装のため。DOMAIN.md §7 / API.md §3.4）。
 */
export function DataGapCard({ gap }: { gap: DataGap }) {
  return (
    <div className="data-gap-card">
      <div className="data-gap-card__eyebrow">{gap.subject}の代わりに</div>
      <div className="data-gap-card__title">{gap.title}</div>
      <p className="data-gap-card__explanation">{gap.explanation}</p>
      <div className="data-gap-card__button" role="button" aria-disabled="true">
        この情報をリクエストする
      </div>
      <p className="data-gap-card__note">
        東京都オープンデータポータルに送信されます。これまでに{gap.requestCount}人がリクエストしています。
      </p>
    </div>
  );
}
