import type { Store } from '../shared/types';
import type { UpstreamProduct } from './upstream';

/** The store records ride along inside each product's inventory block. */
interface RawStore {
  storeId?: string;
  name?: string;
  city?: string;
  region?: string;
  url?: string;
}

interface VariantWithInventory {
  realTimeInventoryStatus?: { stores?: RawStore[] };
}

/**
 * Build the store directory from product pages we already fetched — no extra requests.
 *
 * Unioned across every product rather than taken from the first one: a product that is not
 * carried nationally can list a shorter set, and the sidebar picker needs all of them.
 */
export function buildStores(details: ReadonlyArray<UpstreamProduct | null>): Store[] {
  const byId = new Map<string, Store>();

  for (const product of details) {
    for (const variant of (product?.variants ?? []) as VariantWithInventory[]) {
      for (const raw of variant.realTimeInventoryStatus?.stores ?? []) {
        if (!raw.storeId || byId.has(raw.storeId)) continue;
        byId.set(raw.storeId, {
          id: raw.storeId,
          name: raw.name ?? '',
          city: raw.city ?? '',
          region: raw.region ?? '',
          url: raw.url ?? '',
        });
      }
    }
  }

  return [...byId.values()].sort((a, b) => new Intl.Collator('sv').compare(a.name, b.name));
}
