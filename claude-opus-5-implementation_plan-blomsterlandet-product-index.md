# Implementation Plan: Blomsterlandet Trädgårdsrea Spec Browser

**Status:** Awaiting User Review
**Date:** 2026-09-23
**Suffix:** `blomsterlandet-product-index`
**Builds on:** [claude-opus-5-investigation-blomsterlandet-product-index.md](claude-opus-5-investigation-blomsterlandet-product-index.md)

---

## 1. Context & Goal

Build a local, browsable index of all **1,740 products** in the Blomsterlandet Trädgårdsrea campaign, filterable and sortable by plant specifications — the primary case being `Förväntad sluthöjd 50 - 60 cm`.

The investigation established that the campaign listing API carries no specification fields; those live only on product detail pages inside a double-encoded `window.__PRELOADED_STATE__` payload. A full harvest takes ~3.6 minutes and the normalized dataset is ~406 KB gzipped — small enough that the entire catalogue lives in the browser and every filter runs client-side.

### Decisions settled with the user

| Question | Decision | Consequence |
|---|---|---|
| Row granularity | **One row per product** (~1,740) | Specs aggregated across variants; variants shown in the detail panel |
| Height semantics | **Both filter and sort** | Range filter with overlap matching + a sort selector |
| Stack | **React + Vite + TypeScript** | Static build, no backend, no state library |

### Architecture

Two cleanly separated halves, so an upstream site change breaks the harvester and never the UI:

```
harvest/  (Node, run on demand)  ──emits──>  public/data/*.json  ──consumed by──>  src/ (React SPA)
```

### Non-goals

Real-time stock or price accuracy; store-level inventory (`stockInfo.stores[]` is dropped at harvest); any redistribution of the harvested dataset; a backend or database.

---

## 2. Proposed Changes

### 2.1 Project layout

```
blomsterlandet/
├── package.json                  scripts: harvest, dev, build, test
├── tsconfig.json  vite.config.ts  index.html
├── shared/
│   ├── types.ts                  Product/Variant/Range — used by BOTH halves
│   └── units.ts                  formatting helpers (cm→"1,2 m") shared with UI
├── harvest/
│   ├── extract-state.ts          __PRELOADED_STATE__ double-decode
│   ├── http.ts                   UA, concurrency gate, retry/backoff, disk cache
│   ├── discover.ts               pill nav → campaign slugs
│   ├── fetch-index.ts            /api/campaigns/{slug}/products, follows nextApiUrl
│   ├── fetch-pdp.ts              PDP → raw product view model
│   ├── normalize.ts              pure spec parsing  ← unit tested
│   ├── aggregate.ts              variants → one product row
│   ├── validate.ts               build gate
│   ├── build.ts                  orchestrator
│   └── cache/                    raw HTML (gitignored)
├── public/data/
│   ├── products.json             ~2.5 MB raw / ~406 KB gzipped
│   ├── facets.json               derived facet catalogue
│   └── meta.json                 harvestedAt, counts, coverage
└── src/
    ├── main.tsx  App.tsx
    ├── lib/{query.ts, sort.ts, format.ts}
    ├── hooks/{useDataset.ts, useFilters.ts}
    └── components/{FilterPanel, RangeFilter, ChipFilter, SortSelect,
                    ProductGrid, ProductCard, ProductDetail, Provenance}
```

### 2.2 Data model — `shared/types.ts`

```ts
export interface Range { lo: number; hi: number }          // always in base unit

export interface Variant {
  sku: string;
  name: string;
  price: number | null;
  potSizeCm?: Range;                 // Krukstorlek when expressed in cm
  potSizeLitre?: Range;              // Krukstorlek when expressed in liter
  specs: Record<string, string>;     // raw values, verbatim, for the detail panel
}

export interface Product {
  id: string;                        // primaryKey
  url: string;
  name: string;
  scientificName: string;
  description: string;
  image: string;
  campaigns: string[];               // 6 products appear in more than one
  taxonomy: string[];                // gtm.category split on '/'
  price: { min: number; max: number; original?: string; promotion?: string };
  dims: Record<string, Range>;       // normalized numeric specs, unioned across variants
  tags: Record<string, string[]>;    // categorical specs, unioned across variants
  variants: Variant[];
  dimsDiffer: string[];              // spec keys where variants disagree → UI hint
}
```

**Aggregation rule.** For each dimensional spec, `lo = min(variant.lo)`, `hi = max(variant.hi)`. When variants disagree the key is recorded in `dimsDiffer` so the detail panel can flag it. Categorical specs are unioned and de-duplicated.

### 2.3 The normalizer — `harvest/normalize.ts`

The one genuinely error-prone piece, and the reason a spec browser is more than a scraper. Pure, table-driven, fully unit-tested.

```ts
const RANGE = /^\s*(\d+(?:[.,]\d+)?)\s*(?:-\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m|liter)?\s*$/i;
const TO_CM = { mm: 0.1, cm: 1, m: 100 } as const;

const DIMENSIONS = {
  'Förväntad sluthöjd': { base: 'cm', fallbackUnit: 'cm' },
  'Leveranshöjd':       { base: 'cm', fallbackUnit: 'cm' },
  'Bredd':              { base: 'cm', fallbackUnit: 'cm' },  // 29/47 values carry no unit
  'Stamhöjd':           { base: 'cm', fallbackUnit: 'cm' },
  'Odlingszon':         { base: 'zone', fallbackUnit: 'zone' },
} as const;
```

Rules, each traceable to measured evidence:

1. **Decimal commas** — `"2,5 - 3 m"` → replace `,` with `.` before `parseFloat`. Verified present.
2. **Unit conversion** — convert to cm via `TO_CM`, so 186 `cm` values and 31 `m` values sort together.
3. **Scalar as degenerate range** — `"100 cm"` → `{lo: 100, hi: 100}`.
4. **Missing unit** — apply `fallbackUnit` (`Bredd: "80"` → 80 cm).
5. **`Krukstorlek` is two dimensions in one field** — route by matched unit: `cm` → `potSizeCm`, `liter` → `potSizeLitre`. Never coerce between them.
6. **Multi-valued categoricals** — split on `/,\s*/` (`"Juli, Augusti, September"` → 3 facet tokens). This is the site's own convention.
7. **Merge the two spec lists** — `productInformationList` ∪ `highlightedTraits`, de-duplicated by name. They overlap on `Utmärkande egenskaper` and `Leveranshöjd`; prefer `productInformationList`, and count any value conflict in the harvest report.
8. **Unparseable values are preserved, never dropped** — kept as a categorical tag so nothing silently vanishes from the index.

### 2.4 Harvester — `harvest/`

- **`http.ts`** — descriptive User-Agent, **concurrency capped at 5** (the level measured with zero errors), exponential backoff on 429/503, and a content-addressed disk cache so re-parsing never re-fetches. Cache makes normalizer iteration a seconds-long loop instead of a 3.6-minute one.
- **`discover.ts`** — read campaign slugs from the pill navigation of `/kampanjer/tradgardsrea/`. **Never construct slugs** — `barbuskar-tradgardsrea` breaks its siblings' naming pattern.
- **`fetch-index.ts`** — follow the response's own `nextApiUrl` / `hasMoreProducts` rather than building page URLs.
- **`fetch-pdp.ts`** — fetch each product URL, run `extract-state`, return `pageContent.product`. De-duplicate on `url` before fetching (1,740 rows → 1,739 unique URLs).
- **`build.ts`** — orchestrate, then write `products.json`, `facets.json`, `meta.json`. `facets.json` is **derived from harvested values**, not hardcoded, so a new spec field surfaces automatically instead of being silently ignored.

### 2.5 Validation gate — `harvest/validate.ts`

The build fails loudly rather than writing a half-parsed dataset. Thresholds are set below measured values, so they catch breakage without firing on normal drift:

| Check | Threshold | Measured |
|---|---|---|
| Total products | ≥ 1,500 | 1,740 |
| Campaign slugs discovered | = 8 | 8 |
| Any campaign yielding 0 products | fail | — |
| `Förväntad sluthöjd` coverage | ≥ 90% | 99% |
| Dimensional parse rate | ≥ 95% | 100% |
| PDP fetch failures | ≤ 1% | 0% |

### 2.6 The browser — `src/`

**Query engine (`lib/query.ts`)** — pure functions over the in-memory array. At 1,740 rows a linear scan per keystroke is well under a frame; no indexing needed.

- **Range match, overlap semantics (default):** `r.lo <= filter.hi && r.hi >= filter.lo`. Asking for 50–60 cm returns a plant listed as 40–60 cm, which is the useful reading.
- **Toggle: "helt inom"** — `r.lo >= filter.lo && r.hi <= filter.hi` for strict containment.
- Categorical filters: OR within a facet, AND across facets (the conventional behaviour).
- Text search over `name` + `scientificName`, diacritic-insensitive.

**Sorting (`lib/sort.ts`)** — height (by `lo`, `hi`, or midpoint — selectable, since a range has no single natural order), price, discount %, Swedish name, scientific name; all with `sv` locale collation so å/ä/ö order correctly.

**UI**

- **Filter sidebar** — height range front and centre, then Leveranshöjd, Bredd, Odlingszon, price; chip multi-selects for Läge, Blomfärg, Blomningstid, Växtsätt, Utmärkande egenskaper, Certifiering, campaign. Each facet shows live result counts.
- **Height slider scale** — values span 10 cm to ~2,500 cm. A linear slider makes the perennial range unusable, so it uses a **square-root scale** with paired numeric inputs for exact entry (typing `50` and `60` must be effortless, since that is the user's stated case).
- **Product grid** — image, Swedish + scientific name, height range, price with original struck through, campaign badge.
- **Detail panel** — full spec table, a variants table (pot size / price / SKU), and a flag when `dimsDiffer` is non-empty. Links out to blomsterlandet.se.
- **Provenance bar** — `harvestedAt` timestamp and the campaign-expiry notice, so stale prices are never shown as current.
- **URL state** — filters serialized to the query string, making a filtered view shareable and reloadable.

---

## 3. Phased Execution

| # | Phase | Deliverable | Depends on |
|---|---|---|---|
| 0 | Scaffold | Vite + React + TS project, `tsconfig` paths, vitest wired | — |
| 1 | Extraction core | `extract-state.ts` + `http.ts`; port the verified double-decode | 0 |
| 2 | Index harvest | `discover.ts` + `fetch-index.ts` → 1,740 rows in ~15 s | 1 |
| 3 | PDP harvest | `fetch-pdp.ts` with cache + concurrency → full raw corpus | 2 |
| 4 | Normalizer | `normalize.ts` + `aggregate.ts` **+ unit tests** | 1 |
| 5 | Dataset build | `build.ts` + `validate.ts` → `public/data/*.json` | 3, 4 |
| 6 | App shell | Data loading, types, layout, provenance bar | 0, 5 |
| 7 | Query engine | `query.ts` + `sort.ts` **+ unit tests** | 6 |
| 8 | Filter UI | Range sliders, chip facets, search, sort selector, URL state | 7 |
| 9 | Grid & detail | Cards, detail panel, variants table | 8 |
| 10 | Verification | Full run-through per §4 | all |

Phases 4 and 6–9 depend only on the *shape* of the data, so they can proceed against a small fixture while phase 3 runs.

---

## 4. Verification Plan

**Automated**

1. `npm test` — normalizer unit tests covering every rule in §2.3, each anchored to a real observed value:
   - `"50 - 60 cm"` → `{lo:50, hi:60}`
   - `"2,5 - 3 m"` → `{lo:250, hi:300}` *(decimal comma + unit conversion)*
   - `"80"` under `Bredd` → `{lo:80, hi:80}` *(fallback unit)*
   - `"3,5 liter"` → `potSizeLitre`, **not** `potSizeCm`
   - `"11 cm"` → `potSizeCm`, **not** `potSizeLitre`
   - `"Juli, Augusti, September"` → `["Juli","Augusti","September"]`
   - `"1 - 3"` under `Odlingszon` → `{lo:1, hi:3}`, unit `zone`
   - an unparseable value → retained as a tag, not dropped
2. Query-engine tests: overlap vs containment, facet AND/OR composition, `sv` collation.
3. `npm run harvest` — must pass every §2.5 gate.
4. `npm run build` — typecheck clean, no `any` on the data path.

**Manual — the acceptance case**

5. Filter `Förväntad sluthöjd` to **50–60 cm** and confirm **Afghanperovskia 'Little Spire'** appears — verified during investigation as carrying exactly `"50 - 60 cm"`. This is the end-to-end proof that the user's stated example works.
6. Sort by height ascending and confirm cm/m values interleave correctly — a plant at `2,5 - 3 m` must sort **above** one at `20 - 25 cm`. This is the regression that naive string sorting produces.
7. Confirm result counts: no filters → 1,740; each campaign filter matches §3.2 of the investigation.
8. Check a multi-variant product's detail panel lists every pot size with its own price.
9. Confirm filter response feels instant while typing, and that a reloaded URL restores the filter state.

---

## 5. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Upstream `__PRELOADED_STATE__` shape changes | Validation gate fails the build with a count; raw HTML cache lets us diff what changed |
| Campaign slugs change editorially | Discovered from pill nav each run, never hardcoded |
| Rate limiting appears under load | Concurrency capped at 5 (measured safe), backoff on 429/503, cache means a re-run refetches nothing |
| Long-tail spec fields missed by sampling | Facets derived from harvested values, not a fixed list; harvest report prints the full key histogram |
| Dataset goes stale after campaign ends 11/10 | `harvestedAt` + expiry notice shown in the UI |

---

## 6. Open Items

None blocking. One item deferred by the user's "personal use" framing: publishing the harvested dataset would raise a terms-of-use question the investigation did not resolve (§8 of the investigation). Local use is unaffected.
