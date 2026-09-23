import type { Product, Range } from '~shared/types';
import { rangeContains, rangesOverlap } from '~shared/units';

export type RangeMode = 'overlap' | 'contain';

export interface DimFilter extends Range {
  mode: RangeMode;
}

export interface FilterState {
  search: string;
  /** Spec name → selected span. */
  dims: Record<string, DimFilter>;
  /** Facet name → selected values; OR within a facet, AND across facets. */
  tags: Record<string, string[]>;
  campaigns: string[];
  price: Range | null;
}

export const emptyFilters = (): FilterState => ({
  search: '',
  dims: {},
  tags: {},
  campaigns: [],
  price: null,
});

export const isFilterActive = (f: FilterState): boolean =>
  f.search.trim() !== '' ||
  Object.keys(f.dims).length > 0 ||
  Object.values(f.tags).some((v) => v.length > 0) ||
  f.campaigns.length > 0 ||
  f.price !== null;

/** Diacritic- and case-insensitive, so "rodek" finds "Rödek". */
export const foldText = (value: string): string =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const matchesRange = (value: Range, filter: DimFilter): boolean =>
  filter.mode === 'contain' ? rangeContains(filter, value) : rangesOverlap(value, filter);

export function matches(product: Product, filters: FilterState): boolean {
  const needle = foldText(filters.search.trim());
  if (needle) {
    const haystack = foldText(`${product.name} ${product.scientificName}`);
    if (!needle.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }

  for (const [name, filter] of Object.entries(filters.dims)) {
    const value = product.dims[name];
    // A product missing the spec cannot satisfy a filter on it.
    if (!value || !matchesRange(value, filter)) return false;
  }

  for (const [name, selected] of Object.entries(filters.tags)) {
    if (selected.length === 0) continue;
    const values = product.tags[name];
    if (!values || !selected.some((v) => values.includes(v))) return false;
  }

  if (filters.campaigns.length > 0) {
    if (!filters.campaigns.some((c) => product.campaigns.includes(c))) return false;
  }

  if (filters.price) {
    const { lo, hi } = filters.price;
    if (product.price.max < lo || product.price.min > hi) return false;
  }

  return true;
}

export const applyFilters = (products: Product[], filters: FilterState): Product[] =>
  products.filter((product) => matches(product, filters));

/**
 * Counts each value of one facet as if that facet were unconstrained, so selecting a value
 * never blanks out its siblings — the conventional behaviour for faceted browsing.
 */
export function facetCounts(
  products: Product[],
  filters: FilterState,
  facetName: string,
): Map<string, number> {
  const relaxed: FilterState = { ...filters, tags: { ...filters.tags, [facetName]: [] } };
  const counts = new Map<string, number>();
  for (const product of products) {
    if (!matches(product, relaxed)) continue;
    for (const value of product.tags[facetName] ?? []) {
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
  }
  return counts;
}

/** Campaign counts, relaxed the same way as {@link facetCounts} so siblings stay selectable. */
export function campaignCounts(products: Product[], filters: FilterState): Map<string, number> {
  const relaxed: FilterState = { ...filters, campaigns: [] };
  const counts = new Map<string, number>();
  for (const product of products) {
    if (!matches(product, relaxed)) continue;
    for (const slug of product.campaigns) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1);
    }
  }
  return counts;
}
