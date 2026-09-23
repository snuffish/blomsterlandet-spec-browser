import type { Product } from '~shared/types';

export type Bound = 'lo' | 'hi' | 'mid';
export type Direction = 'asc' | 'desc';

export interface SortState {
  /** 'name' | 'scientificName' | 'price' | 'discount', or a dimensional spec name. */
  field: string;
  /** A range has no single natural order, so the bound to sort on is explicit. */
  bound: Bound;
  dir: Direction;
}

export const defaultSort = (): SortState => ({ field: 'name', bound: 'lo', dir: 'asc' });

const collator = new Intl.Collator('sv', { sensitivity: 'base', numeric: true });

const boundOf = (range: { lo: number; hi: number }, bound: Bound): number =>
  bound === 'lo' ? range.lo : bound === 'hi' ? range.hi : (range.lo + range.hi) / 2;

const discountOf = (product: Product): number => {
  const original = Number.parseFloat((product.price.original ?? '').replace(/[^\d,.]/g, '').replace(',', '.'));
  if (!Number.isFinite(original) || original <= 0 || product.price.min <= 0) return 0;
  return 1 - product.price.min / original;
};

/** Numeric key, or null when the product has nothing to sort on for this field. */
function sortKey(product: Product, sort: SortState): number | null {
  switch (sort.field) {
    case 'price':
      return product.price.min > 0 ? product.price.min : null;
    case 'discount':
      return discountOf(product);
    default: {
      const range = product.dims[sort.field];
      return range ? boundOf(range, sort.bound) : null;
    }
  }
}

/** Comparator for one sort tier, so tiers can be composed into a chain. */
export function comparatorFor(sort: SortState): (a: Product, b: Product) => number {
  const sign = sort.dir === 'asc' ? 1 : -1;

  if (sort.field === 'name' || sort.field === 'scientificName') {
    const field = sort.field;
    return (a, b) => sign * collator.compare(a[field], b[field]);
  }

  return (a, b) => {
    const ka = sortKey(a, sort);
    const kb = sortKey(b, sort);
    // Products lacking the sorted spec sink to the bottom in both directions.
    if (ka === null && kb === null) return 0;
    if (ka === null) return 1;
    if (kb === null) return -1;
    return sign * (ka - kb);
  };
}

/**
 * Tiered sort: the first tier decides, later tiers break ties. This is what "sort that
 * sorting" means once more than one sort is stacked in a chain.
 */
export function applySortChain(products: Product[], tiers: SortState[]): Product[] {
  if (tiers.length === 0) return products;
  const comparators = tiers.map(comparatorFor);
  return [...products].sort((a, b) => {
    for (const compare of comparators) {
      const result = compare(a, b);
      if (result !== 0) return result;
    }
    return collator.compare(a.name, b.name);
  });
}

export function applySort(products: Product[], sort: SortState): Product[] {
  const sign = sort.dir === 'asc' ? 1 : -1;
  const sorted = [...products];

  if (sort.field === 'name' || sort.field === 'scientificName') {
    const field = sort.field;
    sorted.sort((a, b) => sign * collator.compare(a[field], b[field]));
    return sorted;
  }

  sorted.sort((a, b) => {
    const ka = sortKey(a, sort);
    const kb = sortKey(b, sort);
    // Products lacking the sorted spec sink to the bottom in both directions.
    if (ka === null && kb === null) return collator.compare(a.name, b.name);
    if (ka === null) return 1;
    if (kb === null) return -1;
    return sign * (ka - kb) || collator.compare(a.name, b.name);
  });
  return sorted;
}
