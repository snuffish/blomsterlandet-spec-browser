import { describe, expect, it } from 'vitest';
import type { Product } from '~shared/types';
import { applyFilters, campaignCounts, emptyFilters, facetCounts, foldText, matches } from './query';
import { applySort, defaultSort } from './sort';

const product = (over: Partial<Product>): Product => ({
  id: '/x', url: '/x', primaryKey: 'x', name: 'Växt', scientificName: 'Planta', description: '', image: '',
  campaigns: ['tradgardsrea'], taxonomy: [], price: { min: 100, max: 100 },
  dims: {}, tags: {}, variants: [], dimsDiffer: [], ...over,
});

const HEIGHT = 'Förväntad sluthöjd';

describe('range filtering', () => {
  const at = (lo: number, hi: number) => product({ dims: { [HEIGHT]: { lo, hi } } });

  it('overlap: 40–60 cm matches a 50–60 cm request', () => {
    const f = { ...emptyFilters(), dims: { [HEIGHT]: { lo: 50, hi: 60, mode: 'overlap' as const } } };
    expect(matches(at(40, 60), f)).toBe(true);
  });

  it('overlap: a 10–20 cm plant does not match', () => {
    const f = { ...emptyFilters(), dims: { [HEIGHT]: { lo: 50, hi: 60, mode: 'overlap' as const } } };
    expect(matches(at(10, 20), f)).toBe(false);
  });

  it('contain: 40–60 cm is rejected, 50–60 cm accepted', () => {
    const f = { ...emptyFilters(), dims: { [HEIGHT]: { lo: 50, hi: 60, mode: 'contain' as const } } };
    expect(matches(at(40, 60), f)).toBe(false);
    expect(matches(at(50, 60), f)).toBe(true);
  });

  it('excludes products missing the spec entirely', () => {
    const f = { ...emptyFilters(), dims: { [HEIGHT]: { lo: 50, hi: 60, mode: 'overlap' as const } } };
    expect(matches(product({}), f)).toBe(false);
  });
});

describe('categorical filtering', () => {
  const sun = product({ tags: { Läge: ['Sol'], Blomfärg: ['Vit'] } });
  const shade = product({ tags: { Läge: ['Skugga'], Blomfärg: ['Rosa'] } });

  it('ORs within one facet', () => {
    const f = { ...emptyFilters(), tags: { Läge: ['Sol', 'Skugga'] } };
    expect(applyFilters([sun, shade], f)).toHaveLength(2);
  });

  it('ANDs across facets', () => {
    const f = { ...emptyFilters(), tags: { Läge: ['Sol'], Blomfärg: ['Rosa'] } };
    expect(applyFilters([sun, shade], f)).toHaveLength(0);
  });

  it('treats an empty selection as no constraint', () => {
    const f = { ...emptyFilters(), tags: { Läge: [] } };
    expect(applyFilters([sun, shade], f)).toHaveLength(2);
  });
});

describe('facetCounts', () => {
  it('counts a facet as if it were unconstrained, so siblings stay selectable', () => {
    const items = [
      product({ tags: { Läge: ['Sol'] } }),
      product({ tags: { Läge: ['Skugga'] } }),
    ];
    const f = { ...emptyFilters(), tags: { Läge: ['Sol'] } };
    const counts = facetCounts(items, f, 'Läge');
    expect(counts.get('Sol')).toBe(1);
    expect(counts.get('Skugga')).toBe(1);
  });
});

describe('campaignCounts', () => {
  const items = [
    product({ campaigns: ['perenner'], dims: { [HEIGHT]: { lo: 10, hi: 20 } } }),
    product({ campaigns: ['perenner'], dims: { [HEIGHT]: { lo: 200, hi: 300 } } }),
    product({ campaigns: ['rosor'], dims: { [HEIGHT]: { lo: 10, hi: 20 } } }),
  ];

  it('narrows with the rest of the chain', () => {
    const f = { ...emptyFilters(), dims: { [HEIGHT]: { lo: 1, hi: 50, mode: 'overlap' as const } } };
    const counts = campaignCounts(items, f);
    expect(counts.get('perenner')).toBe(1);
    expect(counts.get('rosor')).toBe(1);
  });

  it('ignores the campaign selection itself, so siblings stay selectable', () => {
    const counts = campaignCounts(items, { ...emptyFilters(), campaigns: ['rosor'] });
    expect(counts.get('perenner')).toBe(2);
    expect(counts.get('rosor')).toBe(1);
  });

  it('counts a product listed under two campaigns once in each', () => {
    const both = [product({ campaigns: ['perenner', 'rosor'] })];
    const counts = campaignCounts(both, emptyFilters());
    expect(counts.get('perenner')).toBe(1);
    expect(counts.get('rosor')).toBe(1);
  });
});

describe('search', () => {
  it('folds diacritics and case', () => {
    expect(foldText('Rödek Ähm')).toBe('rodek ahm');
  });

  it('requires every word to appear', () => {
    const p = product({ name: 'Afghanperovskia', scientificName: 'Perovskia atriplicifolia' });
    expect(matches(p, { ...emptyFilters(), search: 'perov atri' })).toBe(true);
    expect(matches(p, { ...emptyFilters(), search: 'perov ros' })).toBe(false);
  });
});

describe('sorting', () => {
  it('ranks a 2,5–3 m tree above a 20–25 cm perennial', () => {
    const tree = product({ name: 'Träd', dims: { [HEIGHT]: { lo: 250, hi: 300 } } });
    const perennial = product({ name: 'Perenn', dims: { [HEIGHT]: { lo: 20, hi: 25 } } });
    const sorted = applySort([tree, perennial], { field: HEIGHT, bound: 'lo', dir: 'asc' });
    expect(sorted.map((p) => p.name)).toEqual(['Perenn', 'Träd']);
  });

  it('honours the chosen bound', () => {
    const wide = product({ name: 'Bred', dims: { [HEIGHT]: { lo: 10, hi: 300 } } });
    const tall = product({ name: 'Hög', dims: { [HEIGHT]: { lo: 50, hi: 60 } } });
    expect(applySort([wide, tall], { field: HEIGHT, bound: 'lo', dir: 'asc' })[0]!.name).toBe('Bred');
    expect(applySort([wide, tall], { field: HEIGHT, bound: 'hi', dir: 'asc' })[0]!.name).toBe('Hög');
  });

  it('sinks products lacking the spec in both directions', () => {
    const has = product({ name: 'Har', dims: { [HEIGHT]: { lo: 50, hi: 60 } } });
    const lacks = product({ name: 'Saknar' });
    for (const dir of ['asc', 'desc'] as const) {
      const sorted = applySort([lacks, has], { field: HEIGHT, bound: 'lo', dir });
      expect(sorted[1]!.name).toBe('Saknar');
    }
  });

  it('collates Swedish names so å/ä/ö follow z', () => {
    const items = [product({ name: 'Åkleja' }), product({ name: 'Blåklocka' })];
    expect(applySort(items, defaultSort()).map((p) => p.name)).toEqual(['Blåklocka', 'Åkleja']);
  });
});
