import { describe, expect, it } from 'vitest';
import { buildStores } from './stores';
import type { UpstreamProduct } from './upstream';

const product = (stores: unknown[]): UpstreamProduct =>
  ({ variants: [{ realTimeInventoryStatus: { stores } }] }) as unknown as UpstreamProduct;

const raw = (id: string, name: string, region = 'Stockholm') => ({
  storeId: id,
  name,
  city: name,
  region,
  url: `https://www.blomsterlandet.se/hitta-din-butik/${name.toLowerCase()}/`,
});

describe('buildStores', () => {
  it('collects the directory from product pages already fetched', () => {
    const stores = buildStores([product([raw('1', 'Arninge'), raw('2', 'Bromma')])]);

    expect(stores).toHaveLength(2);
    expect(stores[0]).toMatchObject({ id: '1', name: 'Arninge', region: 'Stockholm' });
  });

  /** A product not carried nationally lists fewer stores, so one page is not enough. */
  it('unions across products rather than trusting the first', () => {
    const stores = buildStores([
      product([raw('1', 'Arninge')]),
      product([raw('1', 'Arninge'), raw('2', 'Bromma')]),
    ]);

    expect(stores.map((s) => s.id)).toEqual(['1', '2']);
  });

  it('sorts by name with Swedish collation', () => {
    const stores = buildStores([
      product([raw('1', 'Örebro'), raw('2', 'Arninge'), raw('3', 'Älmhult')]),
    ]);

    expect(stores.map((s) => s.name)).toEqual(['Arninge', 'Älmhult', 'Örebro']);
  });

  it('ignores products with no inventory block and stores with no id', () => {
    const stores = buildStores([
      null,
      { variants: [{}] } as UpstreamProduct,
      product([{ name: 'Namnlös' }, raw('5', 'Täby')]),
    ]);

    expect(stores.map((s) => s.id)).toEqual(['5']);
  });
});
