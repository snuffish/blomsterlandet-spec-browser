import { useState } from 'react';

interface Props {
  label: string;
  /** `label` overrides the chip's text when the stored value isn't the human name. */
  values: Array<{ value: string; count: number; label?: string }>;
  selected: string[];
  onToggle: (value: string) => void;
}

const COLLAPSED = 8;

export function ChipFilter({ label, values, selected, onToggle }: Props) {
  const [expanded, setExpanded] = useState(false);
  if (values.length === 0) return null;

  // Selected values stay visible even when they'd fall below the fold.
  const visible = expanded
    ? values
    : [...values.filter((v) => selected.includes(v.value)), ...values.filter((v) => !selected.includes(v.value))]
        .slice(0, COLLAPSED);

  return (
    <fieldset className="chip-filter">
      <legend>{label}</legend>
      <div className="chips">
        {visible.map(({ value, count, label: text }) => {
          const isOn = selected.includes(value);
          return (
            <button
              key={value}
              type="button"
              className={isOn ? 'chip on' : 'chip'}
              aria-pressed={isOn}
              disabled={count === 0 && !isOn}
              onClick={() => onToggle(value)}
            >
              {text ?? value}
              <span className="count">{count}</span>
            </button>
          );
        })}
      </div>
      {values.length > COLLAPSED && (
        <button type="button" className="link" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Visa färre' : `Visa alla ${values.length}`}
        </button>
      )}
    </fieldset>
  );
}
