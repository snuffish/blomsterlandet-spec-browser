import type { Range } from '../shared/types';
import type { UpstreamSpec } from './upstream';

/**
 * Specification values arrive as display strings ("50 - 60 cm", "2,5 - 3 m", "3 liter", "80").
 * Ordering them requires parsing to numbers in a common base unit; ordering the raw strings
 * would rank a 3-metre tree below a 25-centimetre perennial.
 */

export type BaseUnit = 'cm' | 'litre' | 'zone';

/** Everything convertible to centimetres. */
const TO_CM: Record<string, number> = { mm: 0.1, cm: 1, m: 100 };

const RANGE = /^\s*(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m|liter|l)?\s*$/i;

export interface ParsedValue {
  range: Range;
  unit: BaseUnit;
}

/** Specs that carry a measurable quantity, with the unit to assume when the value omits one. */
export const DIMENSION_SPECS: Record<string, { base: BaseUnit; fallbackUnit: string | null }> = {
  'Förväntad sluthöjd': { base: 'cm', fallbackUnit: 'cm' },
  Leveranshöjd: { base: 'cm', fallbackUnit: 'cm' },
  // 29 of 47 observed values carry no unit at all ("80"); centimetres is the only plausible reading.
  Bredd: { base: 'cm', fallbackUnit: 'cm' },
  Stamhöjd: { base: 'cm', fallbackUnit: 'cm' },
  Odlingszon: { base: 'zone', fallbackUnit: null },
};

/**
 * Krukstorlek mixes two incompatible quantities under one label — "11 cm" (a diameter) and
 * "3 liter" (a volume). They are split into separate fields rather than coerced together.
 */
export const POT_SIZE_SPEC = 'Krukstorlek';

const decimal = (raw: string): number => Number.parseFloat(raw.replace(',', '.'));

/** Parse a display value into a span plus its unit family, or null when it isn't a quantity. */
export function parseQuantity(value: string | undefined): ParsedValue | null {
  const match = RANGE.exec(value ?? '');
  if (!match) return null;

  const lo = decimal(match[1] as string);
  const hi = match[2] === undefined ? lo : decimal(match[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;

  const suffix = match[3]?.toLowerCase();
  if (suffix === 'liter' || suffix === 'l') {
    return { range: { lo, hi }, unit: 'litre' };
  }
  if (suffix && suffix in TO_CM) {
    const factor = TO_CM[suffix] as number;
    return { range: { lo: lo * factor, hi: hi * factor }, unit: 'cm' };
  }
  return { range: { lo, hi }, unit: 'zone' }; // unitless — caller decides what that means
}

/** Parse against a named spec, applying that spec's fallback unit and base. */
export function parseDimension(specName: string, value: string | undefined): ParsedValue | null {
  const config = DIMENSION_SPECS[specName];
  if (!config) return null;

  const parsed = parseQuantity(value);
  if (!parsed) return null;

  // A unitless value was tagged 'zone' by the generic parser; reinterpret it for this spec.
  if (parsed.unit === 'zone' && config.base !== 'zone') {
    if (config.fallbackUnit === null) return null;
    const factor = TO_CM[config.fallbackUnit] ?? 1;
    return { range: { lo: parsed.range.lo * factor, hi: parsed.range.hi * factor }, unit: config.base };
  }
  if (parsed.unit !== config.base) return null;
  return parsed;
}

/** Split a comma-joined multi-value into facet tokens — the site's own convention. */
export function splitTokens(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

export type ClassifiedSpec =
  | { kind: 'dimension'; name: string; range: Range; unit: BaseUnit }
  | { kind: 'potSize'; unit: 'cm' | 'litre'; range: Range }
  | { kind: 'tags'; name: string; values: string[] };

/**
 * Route one spec to its normalized form. An unparseable dimensional value falls through to
 * tags rather than being dropped, so nothing silently disappears from the index.
 */
export function classifySpec(spec: UpstreamSpec): ClassifiedSpec | null {
  const name = spec.name?.trim();
  const value = spec.value?.trim();
  if (!name || !value) return null;

  if (name === POT_SIZE_SPEC) {
    const parsed = parseQuantity(value);
    if (parsed && (parsed.unit === 'cm' || parsed.unit === 'litre')) {
      return { kind: 'potSize', unit: parsed.unit, range: parsed.range };
    }
    return { kind: 'tags', name, values: splitTokens(value) };
  }

  if (name in DIMENSION_SPECS) {
    const parsed = parseDimension(name, value);
    if (parsed) return { kind: 'dimension', name, range: parsed.range, unit: parsed.unit };
    return { kind: 'tags', name, values: splitTokens(value) };
  }

  return { kind: 'tags', name, values: splitTokens(value) };
}

/**
 * `productInformationList` and `highlightedTraits` overlap (both carry "Utmärkande egenskaper"
 * and "Leveranshöjd"), so they are merged with the former winning on conflict.
 */
export function mergeSpecLists(
  primary: UpstreamSpec[] = [],
  secondary: UpstreamSpec[] = [],
): UpstreamSpec[] {
  const merged = new Map<string, UpstreamSpec>();
  for (const spec of [...secondary, ...primary]) {
    if (spec?.name) merged.set(spec.name, spec);
  }
  return [...merged.values()];
}
