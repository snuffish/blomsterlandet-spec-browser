import { useState } from 'react';
import type { FacetCatalogue } from '~shared/types';
import { describeStep, isSortStep, type Stage, type Step, type StepInput } from '~/lib/chain';
import type { Bound, Direction } from '~/lib/sort';

const SORTABLE: Array<{ value: string; label: string }> = [
  { value: 'price', label: 'Pris' },
  { value: 'discount', label: 'Rabatt' },
  { value: 'name', label: 'Namn' },
  { value: 'scientificName', label: 'Vetenskapligt namn' },
];

const BOUNDS: Array<{ value: Bound; label: string }> = [
  { value: 'lo', label: 'lägsta' },
  { value: 'hi', label: 'högsta' },
  { value: 'mid', label: 'mitten' },
];

interface Props {
  facets: FacetCatalogue;
  stages: Stage[];
  total: number;
  onAppend: (step: StepInput) => void;
  onRemove: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (id: string, delta: number) => void;
  onUpdate: (id: string, patch: Partial<Step>) => void;
  onReset: () => void;
}

export function ChainPanel({
  facets, stages, total, onAppend, onRemove, onToggle, onMove, onUpdate, onReset,
}: Props) {
  const [adding, setAdding] = useState(false);
  const sortFields = [...SORTABLE, ...Object.keys(facets.dims).map((f) => ({ value: f, label: f }))];

  // Sorts form tiers: the first decides, later ones only break its ties.
  let tier = 0;

  return (
    <section className="chain" aria-label="Filterkedja">
      <header className="chain-head">
        <h2>Filterkedja</h2>
        {stages.length > 0 && (
          <button type="button" className="link" onClick={onReset}>Rensa kedjan</button>
        )}
      </header>

      <ol className="chain-steps">
        <li className="chain-step start">
          <span className="chain-index">0</span>
          <span className="chain-label">Alla växter</span>
          <span className="chain-count">{total.toLocaleString('sv-SE')}</span>
        </li>

        {stages.map((stage, index) => {
          const { step, countAfter, removed } = stage;
          const { verb, detail } = describeStep(step);
          const sortTier = isSortStep(step) && step.enabled ? ++tier : null;

          return (
            <li key={step.id} className={step.enabled ? 'chain-step' : 'chain-step off'}>
              <span className="chain-index">{index + 1}</span>

              <span className="chain-label">
                <strong>{verb}</strong> <span className="chain-detail">{detail}</span>
                {sortTier === 1 && <em className="tier">primär</em>}
                {sortTier !== null && sortTier > 1 && <em className="tier">bryter lika · {sortTier}</em>}
              </span>

              {isSortStep(step) && (
                <span className="chain-inline">
                  <select
                    aria-label="Riktning"
                    value={step.dir}
                    onChange={(e) => onUpdate(step.id, { dir: e.target.value as Direction } as Partial<Step>)}
                  >
                    <option value="asc">stigande</option>
                    <option value="desc">fallande</option>
                  </select>
                  {step.field in facets.dims && (
                    <select
                      aria-label="Efter värde"
                      value={step.bound}
                      onChange={(e) => onUpdate(step.id, { bound: e.target.value as Bound } as Partial<Step>)}
                    >
                      {BOUNDS.map((b) => <option key={b.value} value={b.value}>{b.label}</option>)}
                    </select>
                  )}
                </span>
              )}

              {step.kind === 'limit' && (
                <input
                  className="chain-limit" type="number" min={1} value={step.count}
                  aria-label="Antal att behålla"
                  onChange={(e) => onUpdate(step.id, { count: Number(e.target.value) } as Partial<Step>)}
                />
              )}

              <span className="chain-count">
                {countAfter.toLocaleString('sv-SE')}
                {removed > 0 && <em className="removed">−{removed.toLocaleString('sv-SE')}</em>}
              </span>

              <span className="chain-actions">
                <button type="button" onClick={() => onMove(step.id, -1)} disabled={index === 0} aria-label="Flytta upp">↑</button>
                <button type="button" onClick={() => onMove(step.id, 1)} disabled={index === stages.length - 1} aria-label="Flytta ned">↓</button>
                <button type="button" onClick={() => onToggle(step.id)} aria-label={step.enabled ? 'Inaktivera steg' : 'Aktivera steg'} aria-pressed={!step.enabled}>
                  {step.enabled ? '◉' : '○'}
                </button>
                <button type="button" onClick={() => onRemove(step.id)} aria-label="Ta bort steg">✕</button>
              </span>
            </li>
          );
        })}
      </ol>

      {adding ? (
        <div className="chain-add-form">
          <label>
            <span>Sortera efter</span>
            <select
              defaultValue=""
              onChange={(e) => {
                if (!e.target.value) return;
                onAppend({ kind: 'sort', field: e.target.value, bound: 'lo', dir: 'asc' });
                setAdding(false);
              }}
            >
              <option value="" disabled>Välj fält…</option>
              {sortFields.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <button
            type="button" className="chain-add-limit"
            onClick={() => { onAppend({ kind: 'limit', count: 20 }); setAdding(false); }}
          >
            Behåll de 20 första
          </button>
          <button type="button" className="link" onClick={() => setAdding(false)}>Avbryt</button>
        </div>
      ) : (
        <button type="button" className="chain-add" onClick={() => setAdding(true)}>
          + Lägg till steg
        </button>
      )}

      <p className="chain-hint">
        Filtren i sidopanelen läggs till i kedjan automatiskt. Sorteringar staplas i tiers —
        den första avgör, resten bryter lika. Ett <strong>Behåll</strong>-steg gör ordningen
        betydelsefull: filtrera först, behåll de billigaste, sortera sedan om.
      </p>
    </section>
  );
}
