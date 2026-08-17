import { INTEREST_LABELS } from "../labels";
import type { InterestTag } from "../types";

/**
 * 複数選択のピルグループ（興味・関心）。
 *
 * `options` はドメイン値（ASCII の識別子）で、表示は `INTEREST_LABELS` 越しに引く
 * （Issue #17）。`key` にドメイン値をそのまま使えるのは、表示と値を分けたことで
 * ラベルが変わっても key が動かなくなったため。
 */
type InterestChipsProps = {
  label: string;
  hint: string;
  options: readonly InterestTag[];
  selected: InterestTag[];
  onToggle: (tag: InterestTag) => void;
};

export function InterestChips({ label, hint, options, selected, onToggle }: InterestChipsProps) {
  return (
    <div className="field-card">
      <div className="field-card__title">{label}</div>
      <div className="field-card__hint">{hint}</div>
      <div className="choice-group__options">
        {options.map((tag) => (
          <button
            key={tag}
            type="button"
            className={`chip${selected.includes(tag) ? " chip--active" : ""}`}
            aria-pressed={selected.includes(tag)}
            onClick={() => onToggle(tag)}
          >
            {INTEREST_LABELS[tag]}
          </button>
        ))}
      </div>
    </div>
  );
}
