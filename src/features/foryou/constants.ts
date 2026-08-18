import type { InterestTag } from "../plan/types";

/**
 * あなたへ画面に出す興味チップ。**ここを編集するだけで増減できる**。
 *
 * 実データ検証の結果（2026-08-18）、`ramen` と `nightlife` は現状のカタログでは
 * 常に候補ゼロ（ラーメン: 粒度不足で `insufficient_granularity`。ナイトライフ:
 * キーワード表に該当データなしで `other`）。それでも「正直に答えられないことを見せる」
 * という企画の芯（DOMAIN.md §7）に沿うため、あえて含めたまま運用する。
 * 差し替えたくなったら `shopping` / `nature`（既存の `InterestTag` の値）に
 * 入れ替えるだけでよい — チップの見た目・「すべて」の問い合わせ・レコメンドの
 * 理由ラベルはすべてこの配列と `InterestTag` の完全性（`labels.ts`）から自動的に追従する。
 */
export const FORYOU_INTEREST_TAGS: readonly InterestTag[] = ["ramen", "culture", "family", "nightlife"];

/**
 * 1回に表示するレコメンド件数の上限。`search_datasets` の `limit` とここを
 * 別々にハードコードすると、プランで一度実際に踏んだ「増やしたはずの件数が
 * 黙って頭打ちになる」バグを再発させる（`src/features/plan/constants.ts` の
 * `MAX_STOP_COUNT` と同じ教訓）。
 */
export const RECOMMENDATION_LIMIT = 4;
