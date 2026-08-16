import { BUDGET_OPTIONS, COUNTER_BOUNDS, INTEREST_OPTIONS, PACE_OPTIONS, SETTING_OPTIONS } from "./constants";
import { Counter } from "./components/Counter";
import { ChoiceGroup } from "./components/ChoiceGroup";
import { InterestChips } from "./components/InterestChips";
import type { TripSetupState } from "./usePlanState";

export function TripSetupScreen({ state }: { state: TripSetupState }) {
  const { trip, bumpCounter, setTrip, toggleInterest, saveTrip } = state;

  return (
    <div className="screen">
      <div className="eyebrow">旅のプロフィール</div>
      <div className="screen-header__title">あなたの旅について教えてください。</div>
      <p className="screen-header__lead">ルートもマナーのメモもおすすめも、ここでの回答をもとに作られます。</p>

      <div className="field-stack">
        <div className="field-card">
          <div className="field-card__title">同行者</div>
          <Counter
            label="大人"
            hint="13歳以上"
            value={trip.adults}
            onDecrement={() => bumpCounter("adults", -1, COUNTER_BOUNDS.adults.min, COUNTER_BOUNDS.adults.max)}
            onIncrement={() => bumpCounter("adults", 1, COUNTER_BOUNDS.adults.min, COUNTER_BOUNDS.adults.max)}
          />
          <Counter
            label="子ども"
            hint="ペースや行先の選び方が変わります"
            value={trip.kids}
            onDecrement={() => bumpCounter("kids", -1, COUNTER_BOUNDS.kids.min, COUNTER_BOUNDS.kids.max)}
            onIncrement={() => bumpCounter("kids", 1, COUNTER_BOUNDS.kids.min, COUNTER_BOUNDS.kids.max)}
          />
          <Counter
            label="滞在日数"
            hint="東京で過ごす日数"
            value={trip.days}
            onDecrement={() => bumpCounter("days", -1, COUNTER_BOUNDS.days.min, COUNTER_BOUNDS.days.max)}
            onIncrement={() => bumpCounter("days", 1, COUNTER_BOUNDS.days.min, COUNTER_BOUNDS.days.max)}
          />
        </div>

        <InterestChips
          label="興味・関心"
          hint="いくつでも選べます。"
          options={INTEREST_OPTIONS}
          selected={trip.interests}
          onToggle={toggleInterest}
        />
        <ChoiceGroup
          label="屋内・屋外"
          hint="天候が崩れたときの提案に反映されます。"
          options={SETTING_OPTIONS}
          value={trip.setting}
          onSelect={(setting) => setTrip("setting", setting)}
        />
        <ChoiceGroup
          label="ペース"
          hint="1日にどれだけ詰め込むか。"
          options={PACE_OPTIONS}
          value={trip.pace}
          onSelect={(pace) => setTrip("pace", pace)}
        />
        <ChoiceGroup
          label="予算"
          hint="1人1日あたり。"
          options={BUDGET_OPTIONS}
          value={trip.budget}
          onSelect={(budget) => setTrip("budget", budget)}
        />

        <div className="field-card">
          <div className="field-card__title">その他のご希望</div>
          <div className="field-card__hint">食事制限、移動のしやすさ、避けたいことなど。</div>
          <input
            className="notes-input"
            value={trip.notes}
            onChange={(e) => setTrip("notes", e.target.value)}
            placeholder="例：ベジタリアン、長時間の徒歩は避けたい"
          />
        </div>

        <div>
          <button type="button" className="primary-button" onClick={saveTrip}>
            ブリーフィングを作成
          </button>
          <p className="helper-text">内容はあとからブリーフィング画面で変更できます。</p>
        </div>
      </div>
    </div>
  );
}
