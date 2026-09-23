import type { FacetCatalogue, Product, Range, Variant } from '../shared/types';
import { unionRange } from '../shared/units';
import { DIMENSION_SPECS, classifySpec, mergeSpecLists } from './normalize';
import type { IndexedCard } from './fetch-index';
import type { UpstreamProduct, UpstreamVariant } from './upstream';

/**
 * One row per product: dimensional specs are unioned across variants (a 1 L and a 3 L pot of
 * the same plant nearly always share a height), and any genuine disagreement is recorded in
 * `dimsDiffer` so the detail panel can say so rather than quietly picking a winner.
 */
export function buildProduct(
  cards: IndexedCard[],
  detail: UpstreamProduct | null,
): Product | null {
  const first = cards[0]?.card;
  if (!first?.url) return null;

  const variants: Variant[] = [];
  const dims: Record<string, Range> = {};
  const tags: Record<string, Set<string>> = {};
  const seenDim: Record<string, Range[]> = {};

  for (const upstream of detail?.variants ?? []) {
    variants.push(collectVariant(upstream, dims, tags, seenDim));
  }

  const dimsDiffer = Object.entries(seenDim)
    .filter(([, spans]) => spans.some((s) => s.lo !== spans[0]!.lo || s.hi !== spans[0]!.hi))
    .map(([name]) => name);

  const prices = [
    ...variants.map((v) => v.price),
    first.price?.numericalPrice ?? null,
  ].filter((p): p is number => typeof p === 'number' && p > 0);

  return {
    id: first.url,
    url: first.url,
    primaryKey: first.primaryKey ?? '',
    name: detail?.name ?? first.name ?? '',
    scientificName: detail?.scientificName ?? first.scientificName ?? '',
    description: (detail?.description ?? first.description ?? '').trim(),
    image: first.image?.baseUrl ?? '',
    campaigns: [...new Set(cards.map((c) => c.campaign))],
    taxonomy: (first.gtm?.category ?? '').split('/').filter(Boolean),
    price: {
      min: prices.length ? Math.min(...prices) : 0,
      max: prices.length ? Math.max(...prices) : 0,
      original: first.price?.formattedOriginalPrice,
      promotion: first.price?.promotion,
    },
    dims,
    tags: Object.fromEntries(
      Object.entries(tags).map(([key, values]) => [key, [...values].sort(collator.compare)]),
    ),
    variants,
    dimsDiffer,
  };
}

function collectVariant(
  upstream: UpstreamVariant,
  dims: Record<string, Range>,
  tags: Record<string, Set<string>>,
  seenDim: Record<string, Range[]>,
): Variant {
  const variant: Variant = {
    sku: upstream.sku ?? upstream.code ?? '',
    name: (upstream.name ?? '').trim(),
    price: upstream.price?.numericalPrice ?? null,
    specs: {},
  };

  const specs = mergeSpecLists(upstream.productInformationList, upstream.highlightedTraits);
  for (const spec of specs) {
    if (spec.name && spec.value) variant.specs[spec.name] = spec.value;

    const classified = classifySpec(spec);
    if (!classified) continue;

    if (classified.kind === 'dimension') {
      const existing = dims[classified.name];
      dims[classified.name] = existing ? unionRange(existing, classified.range) : classified.range;
      (seenDim[classified.name] ??= []).push(classified.range);
    } else if (classified.kind === 'potSize') {
      if (classified.unit === 'cm') variant.potSizeCm = classified.range;
      else variant.potSizeLitre = classified.range;
    } else {
      const bucket = (tags[classified.name] ??= new Set<string>());
      for (const value of classified.values) bucket.add(value);
    }
  }
  return variant;
}

const collator = new Intl.Collator('sv');

/** Facets are derived from harvested values so a new upstream spec field surfaces on its own. */
export function buildFacets(
  products: Product[],
  campaignLabels: Map<string, string>,
): FacetCatalogue {
  const dims: FacetCatalogue['dims'] = {};
  const tagCounts = new Map<string, Map<string, number>>();
  const campaignCounts = new Map<string, number>();
  let priceMin = Number.POSITIVE_INFINITY;
  let priceMax = 0;

  for (const product of products) {
    for (const [name, range] of Object.entries(product.dims)) {
      const unit = DIMENSION_SPECS[name]?.base ?? 'cm';
      const entry = (dims[name] ??= { min: range.lo, max: range.hi, unit, count: 0 });
      entry.min = Math.min(entry.min, range.lo);
      entry.max = Math.max(entry.max, range.hi);
      entry.count += 1;
    }
    for (const [name, values] of Object.entries(product.tags)) {
      const bucket = tagCounts.get(name) ?? new Map<string, number>();
      for (const value of values) bucket.set(value, (bucket.get(value) ?? 0) + 1);
      tagCounts.set(name, bucket);
    }
    for (const campaign of product.campaigns) {
      campaignCounts.set(campaign, (campaignCounts.get(campaign) ?? 0) + 1);
    }
    if (product.price.min > 0) priceMin = Math.min(priceMin, product.price.min);
    priceMax = Math.max(priceMax, product.price.max);
  }

  return {
    dims,
    tags: Object.fromEntries(
      [...tagCounts.entries()]
        .sort(([a], [b]) => collator.compare(a, b))
        .map(([name, bucket]) => [
          name,
          [...bucket.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count || collator.compare(a.value, b.value)),
        ]),
    ),
    campaigns: [...campaignCounts.entries()]
      .map(([value, count]) => ({ value, label: campaignLabels.get(value) ?? value, count }))
      .sort((a, b) => b.count - a.count),
    price: { min: Number.isFinite(priceMin) ? priceMin : 0, max: priceMax },
  };
}
