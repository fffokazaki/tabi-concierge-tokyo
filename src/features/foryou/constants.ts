import type { InterestTag } from "../plan/types";

/**
 * あなたへ画面に出す興味チップ。**ここを編集するだけで増減できる**。
 *
 * `ramen` は意図的に残す。実データ検証済みの `insufficient_granularity`（粒度不足）を
 * 具体的な理由つきで返す、正直な「答えられない」実演として価値がある
 * （DOMAIN.md §7・2026-08-18 実測）。
 *
 * `nightlife` は `nature` へ差し替え済み（2026-08-19・Futoshi が本番データで確認）。
 * nightlife はカタログ全10件にキーワードが1件も当たらず常に候補ゼロだった。
 * 差し替え候補として `shopping` も検討したが、こちらも候補ゼロ（nightlife より悪い）。
 * `nature` は実データで実在候補1件（渋谷区都市公園一覧）を確認済みで、
 * search_datasets → aggregate_dataset → get_provenance の一連が実際に動くことを
 * Futoshi が本番データで確認している。
 *
 * さらに差し替えたくなったら、この配列を編集するだけでよい — チップの見た目・
 * 「すべて」の問い合わせ・レコメンドの理由ラベルはすべてこの配列と `InterestTag` の
 * 完全性（`labels.ts`）から自動的に追従する。
 */
export const FORYOU_INTEREST_TAGS: readonly InterestTag[] = ["ramen", "culture", "family", "nature"];

/**
 * 1回に表示するレコメンド件数の上限。`search_datasets` の `limit` とここを
 * 別々にハードコードすると、プランで一度実際に踏んだ「増やしたはずの件数が
 * 黙って頭打ちになる」バグを再発させる（`src/features/plan/constants.ts` の
 * `MAX_STOP_COUNT` と同じ教訓）。
 *
 * **4 ではなく 6。** 「すべて」（`FORYOU_INTEREST_TAGS` の4興味をまとめて送る）で
 * 実際に確かめたところ、現在のカタログでは6件のデータセットが `scoreEntry` で
 * 同点1位になる（名所・史跡／文化観光施設／文化財一覧／トイレ情報／銭湯／都市公園・
 * 都立公園一覧。それぞれ「文化」「文化」「文化」「家族」「文化」「自然」のキーワード
 * 1件ずつで同点）。同点の解決は `worker/core/operations.ts` の
 * `.sort((a, b) => b.score - a.score || a.entry.no - b.entry.no)` — カタログ登録順
 * （`no` 昇順）というスコアと無関係な基準で決まる。旧値の 4 だと、6件中「no」が
 * 大きい2件（銭湯・都市公園）が関連度と無関係に毎回落ちていた（都市公園は自然の
 * 唯一の一致先で、渋谷区分として最後に足したデータセットのため `no` が最大）。
 * 6 に上げれば同点6件が全部収まり、この組み合わせでは誰も落ちない。
 * これはフロントエンド側の表示件数の選択であり、バックエンドの制約ではない
 * （`search_datasets` の上限は10件・現状の6はその範囲内）。
 */
export const RECOMMENDATION_LIMIT = 6;
