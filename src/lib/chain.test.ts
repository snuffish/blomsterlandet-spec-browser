import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Product } from '~shared/types';
import { runChain, type Step, type StepInput } from './chain';
import { decodeChain, encodeChain } from './chain-url';

const HEIGHT = 'Förväntad sluthöjd';

const plant = (name: string, height: number, price: number): Product => ({
  id: `/${name}`, url: `/${name}`, primaryKey: name, name, scientificName: name,
  description: '', image: '', campaigns: ['tradgardsrea'], taxonomy: [],
  price: { min: price, max: price }, dims: { [HEIGHT]: { lo: height, hi: height } },
  tags: {}, variants: [], dimsDiffer: [],
});

const step = (s: StepInput, id = Math.random().toString(36)): Step =>
  ({ ...s, id, enabled: true }) as Step;

// Three short plants at differing prices, one tall one.
const CATALOGUE = [
  plant('Billig', 30, 50),
  plant('Dyr', 30, 300),
  plant('Mellan', 30, 120),
  plant('Träd', 500, 20),
];

describe('runChain — the funnel', () => {
  it('reports the count after every step', () => {
    const { stages, products } = runChain(CATALOGUE, [
      step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 60, mode: 'overlap' }),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
    ]);
    expect(stages.map((s) => s.countAfter)).toEqual([3, 3]);
    expect(stages[0]!.removed).toBe(1);
    expect(products.map((p) => p.name)).toEqual(['Billig', 'Mellan', 'Dyr']);
  });

  it('answers the original ask: small plants, cheapest first', () => {
    const { products } = runChain(CATALOGUE, [
      step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 60, mode: 'overlap' }),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
    ]);
    expect(products[0]!.name).toBe('Billig');
    expect(products.some((p) => p.name === 'Träd')).toBe(false);
  });

  it('skips a disabled step but still reports its stage', () => {
    const disabled: Step = { ...step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 60, mode: 'overlap' }), enabled: false };
    const { stages, products } = runChain(CATALOGUE, [disabled]);
    expect(products).toHaveLength(4);
    expect(stages[0]!.countAfter).toBe(4);
  });
});

describe('runChain — tiered sorting', () => {
  const tied = [
    plant('B-billig', 30, 100),
    plant('A-billig', 30, 100),
    plant('C-dyr', 30, 200),
  ];

  it('uses the first sort as primary and later sorts to break ties', () => {
    const { products } = runChain(tied, [
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
      step({ kind: 'sort', field: 'name', bound: 'lo', dir: 'asc' }),
    ]);
    expect(products.map((p) => p.name)).toEqual(['A-billig', 'B-billig', 'C-dyr']);
  });

  it('swapping the tiers changes the outcome', () => {
    const { products } = runChain(tied, [
      step({ kind: 'sort', field: 'name', bound: 'lo', dir: 'desc' }),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
    ]);
    expect(products.map((p) => p.name)).toEqual(['C-dyr', 'B-billig', 'A-billig']);
  });
});

describe('runChain — order matters once a limit is present', () => {
  it('keeps the cheapest two, then re-sorts them by name', () => {
    const { products } = runChain(CATALOGUE, [
      step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 60, mode: 'overlap' }),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
      step({ kind: 'limit', count: 2 }),
    ]);
    expect(products.map((p) => p.name)).toEqual(['Billig', 'Mellan']);
  });

  it('limiting before sorting yields a different set — proving the chain is ordered', () => {
    const early = runChain(CATALOGUE, [
      step({ kind: 'limit', count: 2 }),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
    ]);
    const late = runChain(CATALOGUE, [
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }),
      step({ kind: 'limit', count: 2 }),
    ]);
    expect(early.products.map((p) => p.name)).toEqual(['Billig', 'Dyr']);
    expect(late.products.map((p) => p.name)).toEqual(['Träd', 'Billig']);
  });
});

describe('chain URL round-trip', () => {
  it('preserves step order and every field', () => {
    const steps: Step[] = [
      step({ kind: 'dim', name: HEIGHT, lo: 50, hi: 60, mode: 'contain' }, 'a'),
      step({ kind: 'tag', name: 'Läge', values: ['Sol', 'Skugga'] }, 'b'),
      step({ kind: 'sort', field: 'price', bound: 'mid', dir: 'desc' }, 'c'),
      step({ kind: 'limit', count: 20 }, 'd'),
    ];
    const decoded = decodeChain(`?k=${encodeChain(steps)}`);
    expect(decoded.map((s) => s.kind)).toEqual(['dim', 'tag', 'sort', 'limit']);
    expect(decoded[0]).toMatchObject({ name: HEIGHT, lo: 50, hi: 60, mode: 'contain' });
    expect(decoded[1]).toMatchObject({ name: 'Läge', values: ['Sol', 'Skugga'] });
    expect(decoded[2]).toMatchObject({ field: 'price', bound: 'mid', dir: 'desc' });
    expect(decoded[3]).toMatchObject({ count: 20 });
  });

  it('survives Swedish characters and commas in values', () => {
    const steps = [step({ kind: 'search', value: 'rödek & ek' }, 'a')];
    expect(decodeChain(`?k=${encodeChain(steps)}`)[0]).toMatchObject({ value: 'rödek & ek' });
  });

  it('returns an empty chain for a bare URL', () => {
    expect(decodeChain('')).toEqual([]);
  });
});

describe('runChain — against the real harvested catalogue', () => {
  const catalogue: Product[] = JSON.parse(
    readFileSync(join(process.cwd(), 'public', 'data', 'products.json'), 'utf8'),
  );

  it('answers the user’s ask: små blommor, then cheapest first, keep 5', () => {
    const { products, stages } = runChain(catalogue, [
      step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 40, mode: 'overlap' }, 'a'),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }, 'b'),
      step({ kind: 'limit', count: 5 }, 'c'),
    ]);

    expect(stages[0]!.countAfter).toBeLessThan(catalogue.length);
    expect(stages[0]!.removed).toBeGreaterThan(0);
    expect(products).toHaveLength(5);

    // Every survivor is short, and prices ascend.
    for (const p of products) expect(p.dims[HEIGHT]!.lo).toBeLessThanOrEqual(40);
    const prices = products.map((p) => p.price.min);
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('tiers apply: equal heights are ordered by price', () => {
    const { products } = runChain(catalogue, [
      step({ kind: 'dim', name: HEIGHT, lo: 50, hi: 60, mode: 'contain' }, 'a'),
      step({ kind: 'sort', field: HEIGHT, bound: 'lo', dir: 'asc' }, 'b'),
      step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }, 'c'),
    ]);

    expect(products.length).toBeGreaterThan(10);
    for (let i = 1; i < products.length; i++) {
      const prev = products[i - 1]!;
      const curr = products[i]!;
      expect(prev.dims[HEIGHT]!.lo).toBeLessThanOrEqual(curr.dims[HEIGHT]!.lo);
      if (prev.dims[HEIGHT]!.lo === curr.dims[HEIGHT]!.lo) {
        expect(prev.price.min).toBeLessThanOrEqual(curr.price.min);
      }
    }
  });

  it('moving the limit above the sort yields a different set', () => {
    const chain = (limitFirst: boolean) =>
      runChain(catalogue, [
        step({ kind: 'dim', name: HEIGHT, lo: 1, hi: 40, mode: 'overlap' }, 'a'),
        ...(limitFirst
          ? [step({ kind: 'limit', count: 10 }, 'b'), step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }, 'c')]
          : [step({ kind: 'sort', field: 'price', bound: 'lo', dir: 'asc' }, 'c'), step({ kind: 'limit', count: 10 }, 'b')]),
      ]).products.map((p) => p.id);

    expect(chain(true)).not.toEqual(chain(false));
  });
});
