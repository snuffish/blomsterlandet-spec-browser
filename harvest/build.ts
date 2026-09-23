import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { HarvestMeta, Product } from '../shared/types';
import { buildFacets, buildProduct } from './aggregate';
import { discoverCampaigns } from './discover';
import { fetchCampaignIndex, type IndexedCard } from './fetch-index';
import { fetchProductDetail } from './fetch-pdp';
import { mapPool } from './http';
import { buildStores } from './stores';
import { PRIMARY_DIMENSION, validate } from './validate';

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');
const useCache = !process.argv.includes('--no-cache');

const log = (message: string) => console.log(message);
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

async function main(): Promise<void> {
  const started = Date.now();
  log(`\n🌿 Harvesting Trädgårdsrea${useCache ? '' : ' (cache bypassed)'}\n`);

  log('1/5  Discovering campaigns…');
  const campaigns = await discoverCampaigns(useCache);
  for (const c of campaigns) {
    log(`       ${c.label.padEnd(18)} ${String(c.totalMatching).padStart(5)} products  → ${c.slug}`);
  }

  log('\n2/5  Fetching product index…');
  const indexed: IndexedCard[] = [];
  const emptyCampaigns: string[] = [];
  for (const campaign of campaigns) {
    const cards = await fetchCampaignIndex(campaign, useCache);
    if (cards.length === 0) emptyCampaigns.push(campaign.slug);
    indexed.push(...cards);
  }
  log(`       ${indexed.length} listings across ${campaigns.length} campaigns`);

  // A product can be listed under more than one campaign; fetch its page once.
  const byUrl = new Map<string, IndexedCard[]>();
  for (const entry of indexed) {
    const url = entry.card.url;
    if (url) byUrl.set(url, [...(byUrl.get(url) ?? []), entry]);
  }
  const urls = [...byUrl.keys()];
  log(`       ${urls.length} unique product pages to fetch`);

  log('\n3/5  Fetching product detail pages…');
  let failures = 0;
  const details = await mapPool(
    urls,
    async (url) => {
      try {
        return await fetchProductDetail(url, useCache);
      } catch (error) {
        failures++;
        if (failures <= 5) log(`       ⚠ ${url}: ${(error as Error).message}`);
        return null;
      }
    },
    undefined,
    (done, total) => {
      if (done % 200 === 0 || done === total) {
        log(`       ${String(done).padStart(5)}/${total}`);
      }
    },
  );

  log('\n4/5  Normalizing…');
  const products: Product[] = [];
  urls.forEach((url, i) => {
    const product = buildProduct(byUrl.get(url)!, details[i] ?? null);
    if (product) products.push(product);
  });
  products.sort((a, b) => new Intl.Collator('sv').compare(a.name, b.name));

  const coverage = validate({
    products,
    campaignCount: campaigns.length,
    emptyCampaigns,
    fetchFailures: failures,
    attempted: urls.length,
  });

  const labels = new Map(campaigns.map((c) => [c.slug, c.label]));
  const facets = buildFacets(products, labels);
  // Reference data for the sidebar's store picker; the stock values themselves stay live.
  const stores = buildStores(details);
  const meta: HarvestMeta = {
    harvestedAt: new Date().toISOString(),
    productCount: products.length,
    variantCount: products.reduce((n, p) => n + p.variants.length, 0),
    campaigns: campaigns.map((c) => ({ slug: c.slug, label: c.label, count: c.totalMatching })),
    coverage,
    promotionNotice: products.find((p) => p.price.promotion)?.price.promotion,
  };

  log('\n5/5  Writing dataset…');
  await mkdir(OUT_DIR, { recursive: true });
  await Promise.all([
    writeFile(join(OUT_DIR, 'products.json'), JSON.stringify(products), 'utf8'),
    writeFile(join(OUT_DIR, 'facets.json'), JSON.stringify(facets), 'utf8'),
    writeFile(join(OUT_DIR, 'meta.json'), JSON.stringify(meta, null, 2), 'utf8'),
    writeFile(join(OUT_DIR, 'stores.json'), JSON.stringify(stores, null, 2), 'utf8'),
  ]);

  log(`\n✅ ${products.length} products, ${meta.variantCount} variants`);
  log(`   "${PRIMARY_DIMENSION}" coverage: ${pct(coverage[PRIMARY_DIMENSION] ?? 0)}`);
  log(`   Facets: ${Object.keys(facets.dims).length} dimensional, ${Object.keys(facets.tags).length} categorical`);
  log(`   Stores: ${stores.length}`);
  log(`   Detail fetch failures: ${failures}`);
  log(`   Elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
}

main().catch((error) => {
  console.error(`\n❌ ${error.message}\n`);
  process.exit(1);
});
