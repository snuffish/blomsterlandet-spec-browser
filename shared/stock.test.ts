import { describe, expect, it } from 'vitest';
import { extractLiveStock } from './stock';

/** Wraps a view model the way Blomsterlandet ships it: a double-encoded JSON string literal. */
const page = (state: unknown): string =>
  `<html><script>window.__PRELOADED_STATE__ = ${JSON.stringify(JSON.stringify(state))};</script></html>`;

const inventory = (online: string, stores: unknown[] = []) => ({
  onlineInventoryStatus: online,
  onlineInventoryStatusLabel: 'Online',
  storesHeader: 'Butikslager',
  stores,
});

const store = (id: string, status: string, extra: Record<string, unknown> = {}) => ({
  storeId: id,
  name: `Butik ${id}`,
  city: 'Stad',
  region: 'Region',
  url: `https://www.blomsterlandet.se/hitta-din-butik/${id}/`,
  inventoryStatus: status,
  inventoryStatusLabel: status,
  ...extra,
});

const withVariants = (variants: unknown[]) => page({ pageContent: { product: { variants } } });

describe('extractLiveStock', () => {
  it('reads the payload from a single-variant product', () => {
    const html = withVariants([{ realTimeInventoryStatus: inventory('inStock', [store('1', 'inStock')]) }]);
    const stock = extractLiveStock(html);

    expect(stock?.online).toBe('inStock');
    expect(stock?.onlineLabel).toBe('Online');
    expect(stock?.storesHeader).toBe('Butikslager');
    expect(stock?.stores).toHaveLength(1);
    expect(stock?.stores[0]).toMatchObject({ id: '1', name: 'Butik 1', status: 'inStock' });
  });

  /**
   * The rule measured across 389 cached product pages: exactly one variant ever carries the
   * payload, and it is not necessarily the first. Picking `variants[0]` would return nothing
   * for the 89 multi-variant products in that sample.
   */
  it('finds the one variant carrying stock even when it is not the first', () => {
    const html = withVariants([
      { sku: 'a' },
      { sku: 'b' },
      { sku: 'c', realTimeInventoryStatus: inventory('limitedStock', [store('9', 'limitedStock')]) },
    ]);

    expect(extractLiveStock(html)?.online).toBe('limitedStock');
  });

  it('returns null when no variant carries stock — a real case, not an error', () => {
    expect(extractLiveStock(withVariants([{ sku: 'a' }, { sku: 'b' }]))).toBeNull();
  });

  it('returns null when the product has no variants at all', () => {
    expect(extractLiveStock(page({ pageContent: { product: {} } }))).toBeNull();
  });

  /** A value we don't recognise must survive to the UI, which renders the label verbatim. */
  it('passes an unknown upstream status through rather than dropping the store', () => {
    const html = withVariants([
      { realTimeInventoryStatus: inventory('inStock', [store('1', 'comingSoon')]) },
    ]);
    const stock = extractLiveStock(html);

    expect(stock?.stores).toHaveLength(1);
    expect(stock?.stores[0]?.status).toBe('comingSoon');
  });

  it('tolerates stores with missing fields', () => {
    const html = withVariants([{ realTimeInventoryStatus: inventory('inStock', [{ storeId: '7' }]) }]);

    expect(extractLiveStock(html)?.stores[0]).toMatchObject({ id: '7', name: '', label: '' });
  });

  it('stamps the fetch time so the UI can show the value is live', () => {
    const html = withVariants([{ realTimeInventoryStatus: inventory('inStock') }]);

    expect(extractLiveStock(html, '2026-09-23T10:00:00.000Z')?.fetchedAt).toBe('2026-09-23T10:00:00.000Z');
  });

  it('throws on a page with no view model, so the Worker can answer 502', () => {
    expect(() => extractLiveStock('<html>no state here</html>')).toThrow();
  });
});
