/** 単一選択のピルグループ（屋内屋外・ペース・予算など）。 */
type ChoiceGroupProps<T extends string> = {
  label: string;
  hint: string;
  options: readonly T[];
  value: T;
  onSelect: (option: T) => void;
};

export function ChoiceGroup<T extends string>({ label, hint, options, value, onSelect }: ChoiceGroupProps<T>) {
  return (
    <div className="field-card">
      <div className="field-card__title">{label}</div>
      <div className="field-card__hint">{hint}</div>
      <div className="choice-group__options">
        {options.map((option) => (
          <button
            key={option}
            type="button"
            className={`chip${option === value ? " chip--active" : ""}`}
            aria-pressed={option === value}
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
