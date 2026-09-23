/** A measured span, always stored in the spec's base unit (cm for lengths, litres, zones). */
export interface Range {
  lo: number;
  hi: number;
}

export interface Variant {
  sku: string;
  name: string;
  price: number | null;
  /** Krukstorlek expressed as a length (e.g. "11 cm"). */
  potSizeCm?: Range;
  /** Krukstorlek expressed as a volume (e.g. "3 liter"). Never interchangeable with potSizeCm. */
  potSizeLitre?: Range;
  /** Raw, verbatim spec values for the detail panel — never parsed for display. */
  specs: Record<string, string>;
}

export interface Product {
  /** The product URL — upstream `primaryKey` is NOT unique (three "Avenbok_6" pages exist). */
  id: string;
  url: string;
  primaryKey: string;
  name: string;
  scientificName: string;
  description: string;
  image: string;
  /** A handful of products are listed under more than one campaign. */
  campaigns: string[];
  taxonomy: string[];
  price: {
    min: number;
    max: number;
    original?: string;
    promotion?: string;
  };
  /** Normalized numeric specs, unioned across variants. */
  dims: Record<string, Range>;
  /** Categorical specs, unioned and de-duplicated across variants. */
  tags: Record<string, string[]>;
  variants: Variant[];
  /** Spec keys whose variants disagree — surfaced as a hint in the detail panel. */
  dimsDiffer: string[];
}

export interface FacetCatalogue {
  /** Dimensional specs with their observed extent, for slider bounds. */
  dims: Record<string, { min: number; max: number; unit: string; count: number }>;
  /** Categorical specs with their observed values and frequencies. */
  tags: Record<string, Array<{ value: string; count: number }>>;
  campaigns: Array<{ value: string; label: string; count: number }>;
  price: { min: number; max: number };
}

export interface HarvestMeta {
  harvestedAt: string;
  productCount: number;
  variantCount: number;
  campaigns: Array<{ slug: string; label: string; count: number }>;
  coverage: Record<string, number>;
  promotionNotice?: string;
}

export interface Dataset {
  products: Product[];
  facets: FacetCatalogue;
  meta: HarvestMeta;
  stores: Store[];
}

/* ── Live stock ────────────────────────────────────────────────────────────────
 * Deliberately NOT part of `Product`. The dataset above is a harvested snapshot;
 * everything below is fetched live per request and must never be cached alongside
 * it, so the two are kept structurally separate rather than merged.
 */

/** The four values observed across the live catalogue. */
export type InventoryStatus = 'inStock' | 'limitedStock' | 'onlyOnline' | 'outOfStock';

export interface StoreStock {
  id: string;
  name: string;
  city: string;
  region: string;
  url: string;
  status: InventoryStatus;
  /** Upstream's own Swedish wording, rendered verbatim — never re-derived locally. */
  label: string;
}

/**
 * One physical store. Reference data, not stock: the 61 shops and their names change rarely,
 * so the directory is harvested into the static dataset while the stock values stay live.
 */
export interface Store {
  id: string;
  name: string;
  city: string;
  region: string;
  url: string;
}

export interface LiveStock {
  online: InventoryStatus;
  onlineLabel: string;
  storesHeader: string;
  stores: StoreStock[];
  /** When the Worker read it upstream. Proves the value is not a cached one. */
  fetchedAt: string;
}
