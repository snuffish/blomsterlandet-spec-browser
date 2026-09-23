import { describe, expect, it } from 'vitest';
import { classifySpec, mergeSpecLists, parseDimension, parseQuantity, splitTokens } from './normalize';

/** Every value below was observed on blomsterlandet.se during the investigation. */

describe('parseDimension — Förväntad sluthöjd', () => {
  it('parses the canonical range the user asked for', () => {
    expect(parseDimension('Förväntad sluthöjd', '50 - 60 cm')).toEqual({
      range: { lo: 50, hi: 60 },
      unit: 'cm',
    });
  });

  it('converts metres to centimetres so cm and m sort together', () => {
    expect(parseDimension('Förväntad sluthöjd', '5 - 10 m')).toEqual({
      range: { lo: 500, hi: 1000 },
      unit: 'cm',
    });
  });

  it('handles Swedish decimal commas', () => {
    expect(parseDimension('Förväntad sluthöjd', '2,5 - 3 m')).toEqual({
      range: { lo: 250, hi: 300 },
      unit: 'cm',
    });
  });

  it('treats a scalar as a degenerate range', () => {
    expect(parseDimension('Stamhöjd', '120 cm')).toEqual({ range: { lo: 120, hi: 120 }, unit: 'cm' });
  });

  it('ranks a 3 m tree above a 25 cm perennial — the naive-string-sort regression', () => {
    const tree = parseDimension('Förväntad sluthöjd', '2,5 - 3 m');
    const perennial = parseDimension('Förväntad sluthöjd', '20 - 25 cm');
    expect(tree!.range.lo).toBeGreaterThan(perennial!.range.lo);
  });
});

describe('parseDimension — fallback units', () => {
  it('assumes centimetres for a unitless Bredd', () => {
    expect(parseDimension('Bredd', '80')).toEqual({ range: { lo: 80, hi: 80 }, unit: 'cm' });
  });

  it('still honours an explicit unit on Bredd', () => {
    expect(parseDimension('Bredd', '1 m')).toEqual({ range: { lo: 100, hi: 100 }, unit: 'cm' });
  });

  it('reads Odlingszon as a unitless span', () => {
    expect(parseDimension('Odlingszon', '1 - 3')).toEqual({ range: { lo: 1, hi: 3 }, unit: 'zone' });
  });

  it('rejects a unit-bearing value for a unitless spec', () => {
    expect(parseDimension('Odlingszon', '3 cm')).toBeNull();
  });
});

describe('classifySpec — Krukstorlek mixes two dimensions', () => {
  it('routes a volume to potSizeLitre', () => {
    expect(classifySpec({ name: 'Krukstorlek', value: '3,5 liter' })).toEqual({
      kind: 'potSize',
      unit: 'litre',
      range: { lo: 3.5, hi: 3.5 },
    });
  });

  it('routes a length to potSizeCm', () => {
    expect(classifySpec({ name: 'Krukstorlek', value: '11 cm' })).toEqual({
      kind: 'potSize',
      unit: 'cm',
      range: { lo: 11, hi: 11 },
    });
  });

  it('never coerces between the two', () => {
    const litre = classifySpec({ name: 'Krukstorlek', value: '3 liter' });
    const cm = classifySpec({ name: 'Krukstorlek', value: '3 cm' });
    expect(litre).toMatchObject({ unit: 'litre' });
    expect(cm).toMatchObject({ unit: 'cm' });
  });
});

describe('classifySpec — categorical handling', () => {
  it('splits comma-joined values into facet tokens', () => {
    expect(classifySpec({ name: 'Blomningstid', value: 'Juli, Augusti, September' })).toEqual({
      kind: 'tags',
      name: 'Blomningstid',
      values: ['Juli', 'Augusti', 'September'],
    });
  });

  it('retains an unparseable dimensional value as a tag rather than dropping it', () => {
    const result = classifySpec({ name: 'Förväntad sluthöjd', value: 'Varierar' });
    expect(result).toEqual({ kind: 'tags', name: 'Förväntad sluthöjd', values: ['Varierar'] });
  });

  it('ignores a spec with no value', () => {
    expect(classifySpec({ name: 'Blomfärg' })).toBeNull();
  });
});

describe('splitTokens', () => {
  it('trims and drops empties', () => {
    expect(splitTokens('Sol,  Halvskugga , ')).toEqual(['Sol', 'Halvskugga']);
  });

  it('returns nothing for an absent value', () => {
    expect(splitTokens(undefined)).toEqual([]);
  });
});

describe('mergeSpecLists', () => {
  it('de-duplicates the overlap, letting productInformationList win', () => {
    const merged = mergeSpecLists(
      [{ name: 'Leveranshöjd', value: '20 - 30 cm' }],
      [{ name: 'Leveranshöjd', value: 'WRONG' }, { name: 'Läge', value: 'Sol' }],
    );
    expect(merged).toHaveLength(2);
    expect(merged.find((s) => s.name === 'Leveranshöjd')?.value).toBe('20 - 30 cm');
    expect(merged.find((s) => s.name === 'Läge')?.value).toBe('Sol');
  });
});

describe('parseQuantity', () => {
  it('returns null for prose', () => {
    expect(parseQuantity('Buskigt, Kompakt')).toBeNull();
  });

  it('accepts liter both spelled out and abbreviated', () => {
    expect(parseQuantity('5 liter')?.unit).toBe('litre');
    expect(parseQuantity('5 l')?.unit).toBe('litre');
  });
});
