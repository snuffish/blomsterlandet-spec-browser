import { extractPreloadedState } from './extract-state';
import type { InventoryStatus, LiveStock, StoreStock } from './types';

/** The slice of Blomsterlandet's PDP view model that carries stock. Partial by design. */
interface RawStore {
  storeId?: string;
  name?: string;
  city?: string;
  region?: string;
  url?: string;
  inventoryStatus?: string;
  inventoryStatusLabel?: string;
}

interface RawInventory {
  onlineInventoryStatus?: string;
  onlineInventoryStatusLabel?: string;
  storesHeader?: string;
  stores?: RawStore[];
}

interface RawVariant {
  realTimeInventoryStatus?: RawInventory;
}

interface RawPdpState {
  pageContent?: { product?: { variants?: RawVariant[] } };
}

/** The four values observed live. Unknown values are passed through, not rejected — see below. */
export const KNOWN_STATUSES: ReadonlySet<string> = new Set<InventoryStatus>([
  'inStock',
  'limitedStock',
  'onlyOnline',
  'outOfStock',
]);

/**
 * Measured across 389 cached product pages: exactly one variant ever carries
 * `realTimeInventoryStatus` — 300/300 single-variant products on their only variant, and
 * 89/89 multi-variant products on precisely one of theirs. Never two, so there is no
 * tie to break and no possibility of two variants disagreeing.
 */
function findInventory(state: RawPdpState): RawInventory | null {
  const variants = state.pageContent?.product?.variants;
  if (!Array.isArray(variants)) return null;
  return variants.find((v) => v.realTimeInventoryStatus)?.realTimeInventoryStatus ?? null;
}

/**
 * An upstream status we don't recognise is kept verbatim rather than coerced or dropped:
 * the label is rendered as-is anyway, so a new value degrades to a neutral dot instead of
 * vanishing from the list or throwing.
 */
const asStatus = (value: string | undefined): InventoryStatus =>
  (value ?? 'outOfStock') as InventoryStatus;

const toStore = (raw: RawStore): StoreStock => ({
  id: raw.storeId ?? '',
  name: raw.name ?? '',
  city: raw.city ?? '',
  region: raw.region ?? '',
  url: raw.url ?? '',
  status: asStatus(raw.inventoryStatus),
  label: raw.inventoryStatusLabel ?? '',
});

/**
 * Pull live stock out of a product page's HTML.
 * Returns `null` when the page carries no inventory block at all — a real case the UI must
 * distinguish from a failed request, so it is not an error.
 */
export function extractLiveStock(html: string, fetchedAt = new Date().toISOString()): LiveStock | null {
  const inventory = findInventory(extractPreloadedState<RawPdpState>(html));
  if (!inventory) return null;

  return {
    online: asStatus(inventory.onlineInventoryStatus),
    onlineLabel: inventory.onlineInventoryStatusLabel ?? '',
    storesHeader: inventory.storesHeader ?? '',
    stores: (inventory.stores ?? []).map(toStore),
    fetchedAt,
  };
}
