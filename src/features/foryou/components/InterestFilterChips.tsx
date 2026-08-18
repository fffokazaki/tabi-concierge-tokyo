import { ALL_INTERESTS_LABEL } from "../labels";
import { INTEREST_LABELS } from "../../plan/labels";
import type { ActiveInterest } from "../types";
import type { InterestTag } from "../../plan/types";

/**
 * あなたへ画面の単一選択チップ（`InterestChips` とは選択方式が違うため別コンポーネントにする —
 * プランの興味チップは複数選択、こちらは常に1つだけがアクティブで「すべて」も選べる）。
 *
 * 見た目は既存の `.chip` / `.chip--active` をそのまま使う（新しい CSS を増やさない）。
 */
type InterestFilterChipsProps = {
  options: readonly InterestTag[];
  active: ActiveInterest;
  onSelect: (interest: ActiveInterest) => void;
};

export function InterestFilterChips({ options, active, onSelect }: InterestFilterChipsProps) {
  return (
    <div className="foryou-chips">
      <button
        type="button"
        className={`chip${active === "all" ? " chip--active" : ""}`}
        aria-pressed={active === "all"}
        onClick={() => onSelect("all")}
      >
        {ALL_INTERESTS_LABEL}
      </button>
      {options.map((tag) => (
        <button
          key={tag}
          type="button"
          className={`chip${active === tag ? " chip--active" : ""}`}
          aria-pressed={active === tag}
          onClick={() => onSelect(tag)}
        >
          {INTEREST_LABELS[tag]}
        </button>
      ))}
    </div>
  );
}
