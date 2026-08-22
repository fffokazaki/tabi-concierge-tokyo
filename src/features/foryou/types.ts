import type { ProvenanceSource } from "../../../shared/core";
import type { InterestTag } from "../plan/types";

/**
 * チップで選べる状態。`"all"` は `InterestTag` union に無い UI 専用の値
 * （「すべて」はドメイン値ではなく、複数の興味をまとめて問い合わせる操作）。
 */
export type ActiveInterest = InterestTag | "all";

/**
 * レコメンドカード1件。`aggregate_dataset` の結果と出典を対で持つ（`SourcedStop` と同じ理由 —
 * 出典なしのカードを作れないようにする）。
 *
 * **`area` フィールドは無い。** `AggregateResult`（`shared/core.ts`）は `name`/`summary`/`category` を
 * 持つがエリアは返さず、エリア名を文字列から抜き出す実装は推測で埋めることになる（CLAUDE.md 絶対ルール #1）。
 * デザインカンプの `rec.area` は実装しない。
 *
 * **`reason`（◆ タグ）は null になりうる。** 「すべて」で複数興味をまとめて問い合わせたときは、
 * 1件の候補がどの興味に応えたものかを応答から特定できないため、単一興味を確信を持って
 * 主張しない（enrichしない）。単一チップ選択時のみ確定する。
 */
export type Recommendation = {
  name: string;
  blurb: string;
  reason: string | null;
  source: ProvenanceSource;
};
