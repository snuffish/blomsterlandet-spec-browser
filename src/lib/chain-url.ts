import type { RangeMode } from './query';
import type { Bound, Direction } from './sort';
import { nextStepId, type Step } from './chain';

/**
 * Steps serialize in order — a chain is a sequence, so the URL has to preserve position.
 * Fields are '~'-joined and percent-encoded; steps are '|'-joined.
 */
const FIELD = '~';
const STEP = '|';

const enc = (value: string | number): string => encodeURIComponent(String(value));

export function encodeChain(steps: Step[]): string {
  return steps
    .filter((step) => step.enabled)
    .map((step) => {
      switch (step.kind) {
        case 'search':
          return ['q', step.value].map(enc).join(FIELD);
        case 'dim':
          return ['d', step.name, step.lo, step.hi, step.mode === 'contain' ? 'i' : 'o']
            .map(enc)
            .join(FIELD);
        case 'tag':
          return ['t', step.name, step.values.join(',')].map(enc).join(FIELD);
        case 'campaign':
          return ['c', step.values.join(',')].map(enc).join(FIELD);
        case 'price':
          return ['p', step.lo, step.hi].map(enc).join(FIELD);
        case 'sort':
          return ['s', step.field, step.bound, step.dir].map(enc).join(FIELD);
        case 'limit':
          return ['n', step.count].map(enc).join(FIELD);
      }
    })
    .join(STEP);
}

export function decodeChain(search: string): Step[] {
  const raw = new URLSearchParams(search).get('k');
  if (!raw) return [];

  const steps: Step[] = [];
  for (const chunk of raw.split(STEP)) {
    const parts = chunk.split(FIELD).map(decodeURIComponent);
    const [tag, ...rest] = parts;
    const base = { id: nextStepId(), enabled: true };

    switch (tag) {
      case 'q':
        if (rest[0]) steps.push({ ...base, kind: 'search', value: rest[0] });
        break;
      case 'd': {
        const [name, lo, hi, mode] = rest;
        if (name && Number.isFinite(Number(lo)) && Number.isFinite(Number(hi))) {
          steps.push({
            ...base, kind: 'dim', name, lo: Number(lo), hi: Number(hi),
            mode: (mode === 'i' ? 'contain' : 'overlap') as RangeMode,
          });
        }
        break;
      }
      case 't': {
        const [name, values] = rest;
        if (name && values) {
          steps.push({ ...base, kind: 'tag', name, values: values.split(',').filter(Boolean) });
        }
        break;
      }
      case 'c':
        if (rest[0]) {
          steps.push({ ...base, kind: 'campaign', values: rest[0].split(',').filter(Boolean) });
        }
        break;
      case 'p': {
        const [lo, hi] = rest;
        if (Number.isFinite(Number(lo)) && Number.isFinite(Number(hi))) {
          steps.push({ ...base, kind: 'price', lo: Number(lo), hi: Number(hi) });
        }
        break;
      }
      case 's': {
        const [field, bound, dir] = rest;
        if (field) {
          steps.push({
            ...base, kind: 'sort', field,
            bound: (bound ?? 'lo') as Bound,
            dir: (dir === 'desc' ? 'desc' : 'asc') as Direction,
          });
        }
        break;
      }
      case 'n':
        if (Number.isFinite(Number(rest[0]))) {
          steps.push({ ...base, kind: 'limit', count: Number(rest[0]) });
        }
        break;
      default:
        break;
    }
  }
  return steps;
}
