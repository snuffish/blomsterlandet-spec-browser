import type { Range } from './types';

/** Base unit per spec family. Lengths normalize to cm so cm and m values sort together. */
export type BaseUnit = 'cm' | 'litre' | 'zone';

const SV = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

/** Render a length in cm using whichever unit reads naturally at that magnitude. */
export function formatCm(value: number): string {
  return value >= 100 ? `${SV.format(value / 100)} m` : `${SV.format(value)} cm`;
}

export function formatRange(range: Range, unit: BaseUnit): string {
  const render = (n: number) =>
    unit === 'cm' ? formatCm(n) : unit === 'litre' ? `${SV.format(n)} l` : SV.format(n);
  if (range.lo === range.hi) return render(range.hi);
  // A shared unit suffix reads better than repeating it on both bounds.
  if (unit === 'cm' && range.lo >= 100 === range.hi >= 100) {
    const scale = range.hi >= 100 ? 100 : 1;
    const suffix = range.hi >= 100 ? 'm' : 'cm';
    return `${SV.format(range.lo / scale)}–${SV.format(range.hi / scale)} ${suffix}`;
  }
  return `${render(range.lo)}–${render(range.hi)}`;
}

export const rangesOverlap = (a: Range, b: Range): boolean => a.lo <= b.hi && a.hi >= b.lo;

export const rangeContains = (outer: Range, inner: Range): boolean =>
  inner.lo >= outer.lo && inner.hi <= outer.hi;

/** Union of two spans — how a product's dimension aggregates across its variants. */
export const unionRange = (a: Range, b: Range): Range => ({
  lo: Math.min(a.lo, b.lo),
  hi: Math.max(a.hi, b.hi),
});
