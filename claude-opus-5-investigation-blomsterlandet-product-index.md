# Investigation: Blomsterlandet Trädgårdsrea Product Index & Spec-Browser Web App

**Goal:** Build a browsable web app that indexes every product in the Blomsterlandet "Trädgårdsrea" campaign and lets the user filter and sort by plant specifications such as `Förväntad sluthöjd 50 - 60 cm`.
**Scope:** Greenfield workspace `/Users/snuffish/Projects/blomsterlandet` (empty) + the external source system `www.blomsterlandet.se`.
**Status:** Complete — no blocking unknowns. Three product-facing decisions await the user (§9).
**Date:** 2026-09-23

> **Citation note:** This workspace contains no source code, so there is no local code to cite. Every factual claim below is anchored to a live HTTP endpoint or to a capture in the session scratchpad
> `/private/tmp/claude-501/-Users-snuffish-Projects-blomsterlandet/aa7f7392-044f-4002-8ece-4a7b3a245619/scratchpad/`, referenced as `scratchpad/<file>`.
> All probes were read-only `GET` requests. Nothing outside this artifact was written to the workspace.

---

## 1. Questions Answered

1. **Is there a machine-readable product feed, or must the page be scraped?**
   → A clean JSON API exists. `GET /api/campaigns/{slug}/products?page=N&sorting=Name&filterDefaults=false` returns `application/json` with a `products[]` array plus `totalMatching`, `totalPages`, `pageSize`. Verified: `scratchpad/api_p2.json` (HTTP 200, 269 KB, 0.57 s). The endpoint is declared by the page itself as `ProductListViewModel.apiBaseUrl` (`scratchpad/state.json`).

2. **How many products are in the campaign, and is it one list or several?**
   → **1,740 product cards across 8 sibling campaign slugs**, not one list. The `/kampanjer/tradgardsrea/` URL is only the *Perenner* slice (1,129). Full enumeration verified in `scratchpad/index_all.json` — 1,740 rows, 1,739 unique URLs, 1,734 unique `primaryKey`s (6 cross-category duplicates). See the table in §3.2.

3. **Does the product listing carry the specifications the user wants to sort by?**
   → **No.** `ProductCardViewModel` exposes only name, scientific name, URL, image, price, badge, stock and GTM fields — there is no `Förväntad sluthöjd`. Verified against a full card dump (`scratchpad/state.json`). **This is the single most important finding: the specs must be harvested from each product detail page (PDP).**

4. **Where do the specifications actually live, and are they structured?**
   → Structured, at the **variant** level, in `pageContent.product.variants[].productInformationList[]` as `{name, value, information?}` objects, plus a second list `variants[].highlightedTraits[]`. Example verified value: `{"name": "Förväntad sluthöjd", "value": "50 - 60 cm"}` (`scratchpad/pdp_state.json`). No HTML scraping of rendered markup is required.

5. **How expensive is a full harvest, and is it permitted?**
   → **~3.6 minutes** for all 1,740 PDPs at concurrency 5, measured over a 150-product sample: 18.5 s, 0 errors, ~460 KB/page (`scratchpad/profile_numeric.py` output). `robots.txt` disallows only `/episerver/` and `/utils/` — product pages and `/api/` are permitted (`https://www.blomsterlandet.se/robots.txt`). No rate limiting was observed.

6. **Can `Förväntad sluthöjd` actually be sorted numerically?**
   → Yes, after normalization. Present on **99% of products** (149/150 sampled) and **100% parseable** (217/217 values) with one range regex. But values mix units — 186 `cm` vs 31 `m` — and use **decimal commas** (`"2,5 - 3 m"`). Sorting raw strings would be wrong; see §5.

7. **Is the dataset small enough to ship as a static file?**
   → Yes, decisively. A normalized record averages 1,486 B raw / 239 B gzipped, measured over 120 real products. Extrapolated to 1,740: **2.47 MB raw, 406 KB gzipped** (`scratchpad/size_probe.py`). This fits comfortably in a client-side app with no backend.

---

## 2. Executive Summary (TL;DR)

- **The listing is solved; the specs are the real work.** A documented JSON API enumerates all 1,740 products in ~15 seconds, but it carries *none* of the specification fields the user wants to sort by. Those live only on product detail pages, in `variants[].productInformationList[]`.
- **The source data is structured, not scraped.** Every PDP embeds its full view model as `window.__PRELOADED_STATE__` — a **double-encoded** payload (a JS string literal containing JSON, so `JSON.parse` must run twice). This yields clean `{name, value}` spec pairs and removes any dependency on CSS selectors or rendered markup, which is what makes this project durable rather than brittle.
- **Specs are variant-scoped, and that is a modelling decision, not a detail.** A product averages 1.92 variants (max 8), and each variant carries its own `Krukstorlek` and its own spec list. "Sort products by height" is therefore ambiguous when a product's variants disagree — this is the one design question that shapes the whole UI (§9.1).
- **Values need normalization before they can be ordered.** Mixed units (`cm`/`m`), decimal commas, unitless values (`Bredd: "80"`), and a field that mixes two incompatible dimensions (`Krukstorlek` is sometimes `"11 cm"`, sometimes `"3 liter"`) mean a parse-and-normalize layer is mandatory.
- **Recommended shape: a build-time harvester producing a static JSON dataset, browsed by a client-side SPA.** At 406 KB gzipped the entire catalogue fits in the browser, making every filter and sort instant with zero backend, zero hosting cost, and zero per-query load on Blomsterlandet.
- **The campaign is time-boxed.** Promotion text reads `"50% Trädgårdsrea online t.o.m 11/10"` (`scratchpad/state.json`), so the dataset is perishable and the harvest must be repeatable.

---

## 3. Current-State Architecture & Code Map

### 3.1 The source system

`www.blomsterlandet.se` is an **Optimizely (Episerver) CMS** backing a **server-rendered React** front end — confirmed by `data-epi-property-name` / `data-epi-use-mvc` attributes, `/globalassets/catalog-images/` asset paths, `loadable-components` chunk manifests and `styled-components` v5.3.11 SSR styles (`scratchpad/treadgardsrea.html`).

| Layer | Location / Contract | Responsibility |
|---|---|---|
| Campaign listing page | `GET /kampanjer/{slug}/` | SSR HTML; embeds `window.__PRELOADED_STATE__` |
| Campaign products API | `GET /api/campaigns/{slug}/products?page=N&sorting=&filterDefaults=false` | Paginated JSON, 24/page — **the index source** |
| Product detail page | `GET {product.url}` | SSR HTML; embeds the full `StandardVariationViewModel` — **the spec source** |
| Sitemap | `GET /sitemap.xml` | Declared in `robots.txt`; alternate discovery path |

**Embedded state contract.** Both page types carry:

```
window.__PRELOADED_STATE__ = "{"header":{...}}";
```

This is a **JS string literal whose contents are JSON** — structural quotes are `"`-escaped. Naively substituting `\uXXXX` corrupts genuinely escaped quotes inside HTML-bearing fields and fails to parse. The correct extraction is: read the string literal, then `JSON.parse` twice. A verified 20-line extractor is captured at `scratchpad/extract_state.py` and parses both page types cleanly.

### 3.2 Campaign topology — 8 sibling slugs, not a hierarchy

The pill navigation presents these as children of Trädgårdsrea, but each is an independent campaign slug at the API root. Nested paths such as `/api/campaigns/tradgardsrea/rosor/products` return **404** (verified). Totals read from each page's `ProductListViewModel`:

| Pill label | Campaign slug | Products | Pages |
|---|---|---:|---:|
| Perenner *(the default view)* | `tradgardsrea` | 1,129 | 48 |
| Rosor | `rosor` | 228 | 10 |
| Prydnadsbuskar | `prydnadsbuskar` | 148 | 7 |
| Fruktträd | `frukttrad` | 118 | 5 |
| Bärbuskar | `barbuskar-tradgardsrea` | 62 | 3 |
| Prydnadsträd | `prydnadstrad` | 33 | 2 |
| Häckväxter | `hackvaxter` | 11 | 1 |
| Övriga växter | `ovriga-vaxter` | 11 | 1 |
| **Total** | | **1,740** | **77** |

> Note the trap: `barbuskar-tradgardsrea` breaks the naming pattern of its siblings. Slugs must be read from the pill navigation, never constructed.

### 3.3 Product card schema (index source)

From `ProductCardViewModel` (`scratchpad/state.json`): `primaryKey`, `name`, `scientificName`, `url`, `itemCode`, `image.baseUrl`, `price.{numericalPrice, formattedOriginalPrice, promotion, reducedPrice}`, `badge`, `emblems[]`, `isPurchaseable`, `hasVariants`, `description`, `gtm.{id, gtin, category}`, and `stockInfo.stores[]` (~62 store rows per product — a large payload with no bearing on this app).

`gtm.category` is a ready-made taxonomy path, e.g. `"Växter/Utomhus/Perenner/Halvhöga perenner"` — useful as a free secondary facet.

### 3.4 Product detail schema (spec source)

`pageContent.product` → `{name, subName, scientificName, description, productInformation, primaryKey, isHedge, variants[]}`.

Each entry in `variants[]` carries `{code, sku, name, price, url, stockStatus, productInformationList[], highlightedTraits[], ...}`. Both spec lists share the shape `{name, value, information?}` where `information` is an optional explanatory modal (HTML-entity-encoded prose — display-only, never parse it for values).

**Specification vocabulary**, measured across a 48-product stratified sample (all 8 campaigns):

| `productInformationList` field | Freq | Example values |
|---|---:|---|
| Bladfärg | 91 | `Grön`, `Grågrön, Grön`, `Blågrön` |
| Utmärkande egenskaper | 90 | `Fjärilslockande, För pollinatörer, Lättskött` |
| Växtsätt | 89 | `Marktäckande, Mattbildande`, `Brett och yvigt` |
| Ursprung | 83 | `Japan`, `Kaukasus, V Sibirien` |
| Leveranshöjd | 81 | `20 - 30 cm`, `40 - 60 cm` |
| Blomfärg | 80 | `Blå`, `Rosa, Vit` |
| **Förväntad sluthöjd** | **78** | `20 - 40 cm`, `2,5 - 3 m` |
| Krukstorlek | 72 | `1 liter`, `11 cm`, `3,5 liter` |
| Blomningstid | 69 | `Juni, Juli, Augusti` |
| Certifiering | 52 | `Svenskt Sigill, Från Sverige` |
| Fruktfärg | 47 | `Svart`, `Purpur` |
| Kvalitet - typ av planta | 41 | `Buskplanta`, `Stamträd` |
| Bredd | 32 | `100 cm`, `1 m`, `80` |
| Fruktsmak / Fruktkött | 17 / 17 | `Sötsyrlig`, `Vitt, Saftigt` |
| Grundstam, Ålder på trädet, Odlare, Stamhöjd, Produkttyp, Förpackningsantal | ≤9 each | long tail |

| `highlightedTraits` field | Freq | Example values |
|---|---:|---|
| Läge | 92 | `Sol`, `Sol till halvskugga`, `Halvskugga till skugga` |
| Utmärkande egenskaper | 90 | *(duplicates the list above)* |
| Leveranshöjd | 81 | *(duplicates the list above)* |
| Odlingszon | 76 | `1 - 3`, `1 - 6` |
| Övervintringsförmåga | 9 | `A`, `B`, `C*` |

21 distinct spec fields + 5 highlighted traits, with **overlap between the two lists** — `Utmärkande egenskaper` and `Leveranshöjd` appear in both and must be merged, not double-counted.

---

## 4. Prior Art & Reference Patterns

- **The site's own sort contract** (`ProductListViewModel.sortingOptions`) offers exactly six keys: `Name`, `NameDescending`, `Price`, `PriceDescending`, `ScientificName`, `ScientificNameDescending`. **There is no specification-based sorting anywhere on the site, and campaign listing responses carry no `filters` key at all** (verified: `"filters" in response == False` for every slug). This confirms the user's feature is genuinely absent upstream rather than merely hidden behind a UI control — and it means there is no upstream facet vocabulary to mirror; the app must derive its own from harvested values.
- **Pagination pattern to mirror:** the API is self-describing — each response carries `nextApiUrl` and `hasMoreProducts`, so a harvester should follow `nextApiUrl` rather than construct page URLs.
- **Value convention to mirror:** multi-valued specs are comma-joined single strings (`"Juli, Augusti, September"`), consistently across all fields. Splitting on `", "` is the site's own implicit contract and yields clean multi-select facets.

---

## 5. Constraints & Contracts

| Category | Requirement / Impact | Evidence |
|---|---|---|
| **Unit normalization** | `Förväntad sluthöjd` mixes `cm` (186) and `m` (31). Sorting must convert to one base unit or `"2,5 - 3 m"` sorts below `"20 - 25 cm"`. | 150-product profile |
| **Decimal commas** | Swedish formatting: `"2,5 - 3 m"`. `parseFloat("2,5")` yields `2`. Comma→dot before parsing. | `Förväntad sluthöjd` values |
| **Ranges, not scalars** | Values are `lo - hi` pairs. A range needs both bounds stored; sorting needs a stated convention (by `lo`, by `hi`, or by midpoint), and "matches 50–60 cm" needs interval-overlap semantics, not string equality. | 217/217 values parsed as ranges |
| **Unitless values** | `Bredd` is unitless in 29 of 47 cases (`"80"`). Requires an assumed default unit (cm is the only plausible reading). | `Bredd` profile |
| **Mixed-dimension field** | `Krukstorlek` is `"11 cm"` *or* `"3 liter"` — only 45.8% parse as a length. These are two incompatible quantities sharing one field name and must be split into `potSizeCm` / `potSizeLitre`. | 93/203 parsed |
| **Variant-scoped specs** | Specs hang off variants, not products. 1.92 variants/product average, max 8. | PDP schema |
| **Duplicate spec keys** | `Utmärkande egenskaper` and `Leveranshöjd` appear in both `productInformationList` and `highlightedTraits`. | §3.4 |
| **Double-encoded state** | `__PRELOADED_STATE__` needs two `JSON.parse` passes; single-pass or regex unescaping corrupts HTML-bearing fields. | `scratchpad/extract_state.py` |
| **Campaign expiry** | Promotion reads `t.o.m 11/10`. Prices and membership are perishable; a stale index misleads. | `scratchpad/state.json` |
| **Crawl etiquette** | `robots.txt` permits these paths, but 1,740 PDP fetches is real load. Concurrency ≤5 with a descriptive User-Agent behaved well (0 errors). Cache raw HTML so re-parsing never re-fetches. | `robots.txt`, sample runs |
| **Terms of use** | `robots.txt` compliance is not the same as ToS permission. Personal, non-redistributed browsing use is the assumption here; publishing the dataset would be a different question. | — |
| **Payload trimming** | `stockInfo.stores[]` carries ~62 rows/product with no relevance to browsing; dropping it is most of the size win behind the 239 B/record figure. | `scratchpad/size_probe.py` |

---

## 6. Blast Radius

Greenfield — no existing consumers, no migrations, no downstream contracts. Risk is concentrated in the **external dependency**:

- **Upstream schema drift.** The app is coupled to `__PRELOADED_STATE__` shape and to `/api/campaigns/{slug}/products`. Neither is a published API; both can change without notice. Mitigation: validate at harvest time and fail loudly with a record count, rather than silently writing an empty or half-parsed dataset.
- **Slug drift.** Campaign slugs are editorial (note `barbuskar-tradgardsrea`). Discover them from the pill navigation each run instead of hardcoding.
- **Data staleness.** No push mechanism exists; freshness equals harvest recency. The dataset should carry a `harvestedAt` timestamp that the UI displays.
- **Existing test coverage:** none — nothing exists yet. Worth noting that the normalizer (unit conversion, comma decimals, range parsing, `Krukstorlek` splitting) is pure, table-driven logic and is the one part of this system that genuinely warrants unit tests.

---

## 7. Options & Trade-offs

### Option A — Build-time harvester + static client-side SPA *(Recommended)*
- **Concept:** A Node/TypeScript script harvests all 1,740 PDPs, normalizes specs, and emits a single `products.json` (~2.5 MB / 406 KB gzipped). A static SPA loads it once and does all filtering, faceting and sorting in memory.
- **Pros:** No backend, no database, no hosting cost; deployable to any static host or opened from `file://`. Sub-millisecond filtering across the full catalogue. Fully offline after first load. Harvest and browse are cleanly decoupled, so a site change breaks the harvester — never the UI. Trivially diffable between runs, since the dataset is one file in version control.
- **Cons:** 406 KB initial download. Refresh is a manual re-run (or a cron/CI job). Not suited to real-time stock or price accuracy.
- **Follows:** The site's own pattern of shipping a complete view model to the client up front.

### Option B — Node service + SQLite, server-side query
- **Concept:** Harvest into SQLite; an API serves filtered/sorted pages; the SPA queries it.
- **Pros:** Scales past in-browser limits; SQL expressiveness for range overlap; can schedule incremental refresh and retain price history over time.
- **Cons:** Meaningful added machinery — a server to run, a schema to migrate, an API to version — for a dataset that comfortably fits in a browser tab. Needs a host; loses offline use.
- **Verdict:** Correct if the scope later grows to the full catalogue (tens of thousands of products) or to tracking prices over time. Overbuilt for 1,740 rows.

### Option C — Live on-demand proxy
- **Concept:** No stored index; fetch from Blomsterlandet per user query.
- **Pros:** Always current.
- **Cons:** **Not viable.** Specs exist only on PDPs, so *any* spec filter requires fetching all 1,740 pages — ~3.6 minutes per query, and abusive load on the source. Rejected on mechanics, not preference.

**Recommendation: Option A.** The measurement that settles it is §1.7 — the entire normalized catalogue is 406 KB gzipped. That is smaller than a typical hero image, which means the central architectural question ("where does filtering run?") has an answer that eliminates an entire tier. Option B's benefits are all scale-related, and the measured scale does not call for them. Option A also keeps the fragile part (harvesting) isolated from the part the user actually interacts with.

---

## 8. Confidence Ledger

| Finding | Level | Evidence / Verification |
|---|---|---|
| `/api/campaigns/{slug}/products` returns paginated JSON, 24/page | ✅ Verified | HTTP 200 `application/json`, `scratchpad/api_p2.json` |
| Campaign spans 8 slugs / 1,740 products | ✅ Verified | Full enumeration, `scratchpad/index_all.json` |
| Nested subcategory API paths 404 | ✅ Verified | 7/7 probes returned 404 `text/html` |
| Listing cards contain no specification fields | ✅ Verified | Full `ProductCardViewModel` dump, `scratchpad/state.json` |
| Specs live in `variants[].productInformationList[]` as `{name,value}` | ✅ Verified | `scratchpad/pdp_state.json` |
| `__PRELOADED_STATE__` is double-encoded | ✅ Verified | Raw source inspection; `scratchpad/extract_state.py` parses both page types |
| `Förväntad sluthöjd` on 99% of products, 100% parseable | ✅ Verified | 150-product sample: 149/150 present, 217/217 parsed |
| Height values mix `cm` and `m`, use decimal commas | ✅ Verified | 186 `cm` / 31 `m`; `"2,5 - 3 m"` observed |
| `Krukstorlek` mixes length and volume | ✅ Verified | 93/203 parse as length; rest are `liter` |
| Full harvest ≈ 3.6 min at concurrency 5, 0 errors | ✅ Verified | 150-page timed run, 18.5 s |
| Normalized dataset ≈ 2.47 MB / 406 KB gzipped | ✅ Verified | 120 real records measured, linearly extrapolated |
| `robots.txt` permits product pages and `/api/` | ✅ Verified | Only `/episerver/`, `/utils/` disallowed |
| No rate limiting / IP throttling exists | 🟡 Inferred | 0 errors across ~320 requests at concurrency ≤5. Not stress-tested. Verify by keeping concurrency ≤5 and handling 429/503 with backoff. |
| 21 spec fields + 5 traits is the complete vocabulary | 🟡 Inferred | From a 48-product stratified sample. Rare fields may exist in the unsampled 98%. Verify by accumulating a key histogram during the full harvest rather than assuming this list. |
| The 6 duplicate `primaryKey`s are genuine cross-campaign listings | 🟡 Inferred | Count confirmed; cause not inspected. Verify by diffing the duplicate rows; dedupe on `url`. |
| Campaign ends 11 October | 🟡 Inferred | Read from promotion copy `"t.o.m 11/10"`; year not stated. |
| Blomsterlandet ToS permits personal harvesting | ❓ Unknown | ToS not reviewed. Owned by the user. Non-blocking for local personal use; would block any public redistribution of the dataset. |
| Whether campaign membership changes mid-flight | ❓ Unknown | Would require repeat harvests to observe. Non-blocking. |

---

## 9. Open Questions for User

1. **When a product's variants disagree on a spec, what should the product row show?**
   Products average 1.92 variants (max 8), and a 1 L and a 3 L pot can carry different heights. The options are: show one row per **variant** (most accurate, ~3,300 rows), or one row per **product** with values aggregated across variants (cleaner to browse, ~1,740 rows). This choice shapes the data model and the UI, so it is worth settling before `/plan`.

2. **What should "order by `Förväntad sluthöjd 50 - 60 cm`" mean exactly?**
   Two readings, both reasonable: **filter** — show plants whose height range overlaps 50–60 cm; or **sort** — order all plants by height, using the range's lower bound, upper bound, or midpoint. The measured data supports either, and offering both (a range slider plus a sort selector) is not much more work than one.

3. **Is this for personal use, or will it be published?**
   Local personal use is straightforward. Publishing the harvested dataset raises a terms-of-use question that this investigation did not resolve (§8) and that would need answering first.

---

## 10. Plan Seed

*Structural outline only — sequencing and task breakdown belong to `/plan`.*

- **1.** Establish the project skeleton: TypeScript, a static-SPA build tool, and a clear split between `harvest/` (Node, runs offline) and `app/` (browser).
- **2.** Port the verified `__PRELOADED_STATE__` extractor from `scratchpad/extract_state.py`, keeping the double-`JSON.parse` contract and its failure modes explicit.
- **3.** Build slug discovery from the pill navigation, then index enumeration by following `nextApiUrl` across all 8 campaigns.
- **4.** Build the PDP harvester: bounded concurrency (≤5), raw-HTML caching keyed by URL, retry with backoff, and a harvest manifest carrying `harvestedAt` and per-campaign counts.
- **5.** Define the normalized schema — product → variants → typed specs — merging the `productInformationList` / `highlightedTraits` overlap, and resolving the §9.1 decision.
- **6.** Build the normalizer as pure, table-driven functions: range parsing, comma decimals, unit conversion to a base unit, `Krukstorlek` split into length and volume, and comma-splitting of multi-valued specs into facet tokens. This is the piece that earns unit tests.
- **7.** Derive the facet catalogue from harvested values rather than a hardcoded list, so new spec fields surface automatically.
- **8.** Emit `products.json` + `facets.json`, with a validation gate that fails the build on an implausible record count or parse rate.
- **9.** Build the browse UI: numeric range filters for dimensional specs, multi-select for categorical ones, text search over names, a sort selector honouring the §9.2 decision, and product cards linking back to blomsterlandet.se.
- **10.** Surface data provenance in the UI — harvest timestamp and campaign-expiry notice — so stale prices are never presented as current.
