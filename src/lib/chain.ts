import type { Product } from '~shared/types';
import { emptyFilters, matches, type FilterState, type RangeMode } from './query';
import { applySortChain, type Bound, type Direction, type SortState } from './sort';

/**
 * A chain is an ordered pipeline of steps, each applied to the output of the one before.
 * Pure filters commute, so order between them is cosmetic — but a `limit` step ("the 20
 * cheapest") makes position meaningful, and stacked sorts form tiers where the first decides
 * and later ones break ties.
 */

interface Base {
  id: string;
  enabled: boolean;
}

export type Step =
  | (Base & { kind: 'search'; value: string })
  | (Base & { kind: 'dim'; name: string; lo: number; hi: number; mode: RangeMode })
  | (Base & { kind: 'tag'; name: string; values: string[] })
  | (Base & { kind: 'campaign'; values: string[] })
  | (Base & { kind: 'price'; lo: number; hi: number })
  | (Base & { kind: 'sort'; field: string; bound: Bound; dir: Direction })
  | (Base & { kind: 'limit'; count: number });

export type StepKind = Step['kind'];

/** Plain `Omit` collapses a union to its shared keys; this preserves each variant. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** A step as callers supply it — identity and enabled-state are assigned by the store. */
export type StepInput = DistributiveOmit<Step, 'id' | 'enabled'>;

export const isSortStep = (step: Step): step is Extract<Step, { kind: 'sort' }> =>
  step.kind === 'sort';

export const isFilterStep = (step: Step): boolean =>
  step.kind !== 'sort' && step.kind !== 'limit';

let counter = 0;
export const nextStepId = (): string => `s${Date.now().toString(36)}${(counter++).toString(36)}`;

/** Express one filter step as a FilterState so the tested matcher does the work. */
function asFilterState(step: Step): FilterState {
  const state = emptyFilters();
  switch (step.kind) {
    case 'search':
      state.search = step.value;
      break;
    case 'dim':
      state.dims[step.name] = { lo: step.lo, hi: step.hi, mode: step.mode };
      break;
    case 'tag':
      state.tags[step.name] = step.values;
      break;
    case 'campaign':
      state.campaigns = step.values;
      break;
    case 'price':
      state.price = { lo: step.lo, hi: step.hi };
      break;
    default:
      break;
  }
  return state;
}

export interface Stage {
  step: Step;
  /** Result count once this step has been applied — the funnel readout. */
  countAfter: number;
  removed: number;
}

export interface ChainResult {
  products: Product[];
  stages: Stage[];
}

export function runChain(products: Product[], steps: Step[]): ChainResult {
  let current = products;
  const stages: Stage[] = [];
  const tiers: SortState[] = [];

  for (const step of steps) {
    const before = current.length;

    if (step.enabled) {
      if (step.kind === 'sort') {
        tiers.push({ field: step.field, bound: step.bound, dir: step.dir });
        current = applySortChain(current, tiers);
      } else if (step.kind === 'limit') {
        current = current.slice(0, Math.max(0, step.count));
      } else {
        const filter = asFilterState(step);
        current = current.filter((product) => matches(product, filter));
      }
    }

    stages.push({ step, countAfter: current.length, removed: before - current.length });
  }

  return { products: current, stages };
}

/** The chain's filter steps as a single state, so the sidebar can show what's active. */
export function chainToFilterState(steps: Step[]): FilterState {
  const state = emptyFilters();
  for (const step of steps) {
    if (!step.enabled) continue;
    switch (step.kind) {
      case 'search':
        state.search = step.value;
        break;
      case 'dim':
        state.dims[step.name] = { lo: step.lo, hi: step.hi, mode: step.mode };
        break;
      case 'tag':
        state.tags[step.name] = step.values;
        break;
      case 'campaign':
        state.campaigns = step.values;
        break;
      case 'price':
        state.price = { lo: step.lo, hi: step.hi };
        break;
      default:
        break;
    }
  }
  return state;
}

export const sortTiers = (steps: Step[]): Step[] => steps.filter((s) => isSortStep(s) && s.enabled);

/** Human-readable summary used by the chain list and by aria labels. */
export function describeStep(step: Step): { verb: string; detail: string } {
  switch (step.kind) {
    case 'search':
      return { verb: 'Sök', detail: `”${step.value}”` };
    case 'dim':
      return {
        verb: step.name,
        detail: `${step.lo}–${step.hi}${step.mode === 'contain' ? ' (helt inom)' : ''}`,
      };
    case 'tag':
      return { verb: step.name, detail: step.values.join(' eller ') };
    case 'campaign':
      return { verb: 'Kategori', detail: step.values.join(' eller ') };
    case 'price':
      return { verb: 'Pris', detail: `${step.lo}–${step.hi} kr` };
    case 'sort':
      return {
        verb: 'Sortera',
        detail: `${step.field} ${step.dir === 'asc' ? 'stigande' : 'fallande'}`,
      };
    case 'limit':
      return { verb: 'Behåll', detail: `de ${step.count} första` };
  }
}
