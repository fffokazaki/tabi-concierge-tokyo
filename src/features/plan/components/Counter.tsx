type CounterProps = {
  label: string;
  hint: string;
  value: number;
  onDecrement: () => void;
  onIncrement: () => void;
};

export function Counter({ label, hint, value, onDecrement, onIncrement }: CounterProps) {
  return (
    <div className="counter-row">
      <div>
        <div className="counter-row__label">{label}</div>
        <div className="counter-row__hint">{hint}</div>
      </div>
      <div className="counter-row__controls">
        <button type="button" className="counter-btn" onClick={onDecrement} aria-label={`${label}を減らす`}>
          −
        </button>
        <div className="counter-value">{value}</div>
        <button type="button" className="counter-btn" onClick={onIncrement} aria-label={`${label}を増やす`}>
          +
        </button>
      </div>
    </div>
  );
}
