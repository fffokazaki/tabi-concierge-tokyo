import type { InterestTag } from "../types";

/** 複数選択のピルグループ（興味・関心）。 */
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
            {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
