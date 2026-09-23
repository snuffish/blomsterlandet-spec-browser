import { useEffect, useId, useState } from 'react';
import type { BaseUnit } from '~shared/units';
import { formatRange } from '~shared/units';
import type { DimFilter, RangeMode } from '~/lib/query';

interface Props {
  label: string;
  min: number;
  max: number;
  unit: BaseUnit;
  value: DimFilter | null;
  onChange: (value: DimFilter | null) => void;
}

const STEPS = 1000;

/**
 * Heights span 10 cm to ~25 m, so a linear track makes the perennial range unusable —
 * the thumb barely moves across the bulk of the catalogue. A square-root scale gives the
 * short end the room it needs, and the numeric inputs stay authoritative for exact entry.
 */
const toSlider = (value: number, min: number, max: number): number =>
  max <= min ? 0 : Math.round(Math.sqrt((value - min) / (max - min)) * STEPS);

const fromSlider = (position: number, min: number, max: number): number =>
  Math.round(min + (position / STEPS) ** 2 * (max - min));

export function RangeFilter({ label, min, max, unit, value, onChange }: Props) {
  const id = useId();
  const active = value ?? { lo: min, hi: max, mode: 'overlap' as RangeMode };
  const [draft, setDraft] = useState<[string, string]>([String(active.lo), String(active.hi)]);

  useEffect(() => {
    setDraft([String(active.lo), String(active.hi)]);
  }, [active.lo, active.hi]);

  const commit = (lo: number, hi: number, mode: RangeMode = active.mode): void => {
    const clampedLo = Math.max(min, Math.min(lo, hi));
    const clampedHi = Math.min(max, Math.max(hi, lo));
    if (clampedLo <= min && clampedHi >= max && mode === 'overlap') onChange(null);
    else onChange({ lo: clampedLo, hi: clampedHi, mode });
  };

  const commitDraft = (): void => {
    const lo = Number.parseFloat(draft[0].replace(',', '.'));
    const hi = Number.parseFloat(draft[1].replace(',', '.'));
    if (Number.isFinite(lo) && Number.isFinite(hi)) commit(lo, hi);
    else setDraft([String(active.lo), String(active.hi)]);
  };

  const loPos = toSlider(active.lo, min, max);
  const hiPos = toSlider(active.hi, min, max);

  return (
    <fieldset className="range-filter">
      <legend>
        {label}
        {value && (
          <button type="button" className="clear" onClick={() => onChange(null)} aria-label={`Rensa ${label}`}>
            ✕
          </button>
        )}
      </legend>

      <div className="range-readout">{formatRange({ lo: active.lo, hi: active.hi }, unit)}</div>

      <div className="dual-slider" style={{ '--lo': `${loPos / 10}%`, '--hi': `${hiPos / 10}%` } as React.CSSProperties}>
        <div className="track" />
        <div className="track-fill" />
        <input
          type="range" min={0} max={STEPS} value={loPos}
          aria-label={`${label} – minsta`}
          onChange={(e) => commit(fromSlider(Number(e.target.value), min, max), active.hi)}
        />
        <input
          type="range" min={0} max={STEPS} value={hiPos}
          aria-label={`${label} – största`}
          onChange={(e) => commit(active.lo, fromSlider(Number(e.target.value), min, max))}
        />
      </div>

      <div className="range-inputs">
        <input
          id={`${id}-lo`} type="text" inputMode="numeric" value={draft[0]}
          aria-label={`${label} – från`}
          onChange={(e) => setDraft([e.target.value, draft[1]])}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
        />
        <span className="dash">–</span>
        <input
          id={`${id}-hi`} type="text" inputMode="numeric" value={draft[1]}
          aria-label={`${label} – till`}
          onChange={(e) => setDraft([draft[0], e.target.value])}
          onBlur={commitDraft}
          onKeyDown={(e) => e.key === 'Enter' && commitDraft()}
        />
        <span className="unit">{unit === 'cm' ? 'cm' : unit === 'litre' ? 'l' : 'zon'}</span>
      </div>

      <label className="mode-toggle">
        <input
          type="checkbox" checked={active.mode === 'contain'}
          onChange={(e) => commit(active.lo, active.hi, e.target.checked ? 'contain' : 'overlap')}
        />
        <span>Endast växter helt inom intervallet</span>
      </label>
    </fieldset>
  );
}
