/**
 * 単一選択のピルグループ（屋内屋外・ペース・予算など）。
 *
 * `options` はドメイン値（ASCII の識別子）で、表示は `labels` 越しに引く。値をそのまま
 * 描画すると "balanced" が画面に出てしまう。`Record<T, string>` を要求しているので、
 * ラベルの無い選択肢を渡すとコンパイルエラーになる（Issue #17）。
 */
type ChoiceGroupProps<T extends string> = {
  label: string;
  hint: string;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onSelect: (option: T) => void;
};

export function ChoiceGroup<T extends string>({
  label,
  hint,
  options,
  labels,
  value,
  onSelect,
}: ChoiceGroupProps<T>) {
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
            {labels[option]}
          </button>
        ))}
      </div>
    </div>
  );
}
