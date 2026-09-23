# Investigation: Live "Lagerstatus" (stock status) for products

**Goal:** Show each product's real, uncached stock status — online and per store — fetched live from blomsterlandet.se rather than baked into the harvested dataset.
**Scope:** `shared/types.ts`, `src/components/{ProductCard,ProductDetail}.tsx`, `harvest/{fetch-index,fetch-pdp,extract-state}.ts`, plus the live upstream endpoints and the GitHub Pages hosting model committed in `e9de6f2`.
**Status:** Complete — one hard architectural blocker (CORS) with no zero-infrastructure workaround. Two decisions await the user (§9).
**Date:** 2026-09-23

---

## 1. Questions Answered

1. **Does the app model stock today?**
   → **No.** `shared/types.ts` defines `Variant` (`:7-19`) and `Product` (`:21-45`) with no stock, availability or inventory field; a case-insensitive search for `stock|lager|availab|inStock` across `shared/`, `harvest/upstream.ts` and `src/` returns **zero** hits. This is purely additive.

2. **Where does stock live upstream, and is it structured?**
   → **Two places, both structured JSON.**
   - **PDP**, inside `window.__PRELOADED_STATE__`: `pageContent.product.variants[].realTimeInventoryStatus` → `{ onlineInventoryStatus, onlineInventoryStatusLabel, storesHeader, stores[61] }`, each store `{ storeId, name, url, inventoryStatus, inventoryStatusLabel }`. Verified against the user's example URL (HTTP 200, 465 373 B) decoded with the project's own `harvest/extract-state.ts:14`.
   - **Campaign list API**, `GET /api/campaigns/{slug}/products?page=N&sorting=Name&filterDefaults=false`: every card carries `stockInfo` → `{ online, stores[61]{ storeId, optiStoreId, inventoryStatus } }`. Verified on page 1 of `tradgardsrea` (HTTP 200, 271 462 B, 24/24 cards had `stockInfo`).

3. **What is the value domain?**
   → `online`: `inStock` observed. Per-store `inventoryStatus`: **`inStock`, `limitedStock`, `onlyOnline`, `outOfStock`** (all four observed on one page). Swedish labels come from `header.strings`: `inStockLabel="I lager"`, `limitedStockLabel="Fåtal i lager"`, `outOfStockLabel="Slut i lager"`, `seeStockInStoresLabel="Se butikslager"`, plus `onlyOnline` → `"Säljs endast online"`. These match the screenshot exactly.

4. **Is there a cheap, dedicated inventory endpoint?**
   → **No.** The only inventory-named asset is the client chunk `/build/client/static/js/OmniumInventoryModal_83aec1df.js` (16 987 B); it contains **no `fetch` call and no URL** — it only *renders* `inventoryStatus`/`inventoryStatusLabel`. Stock is therefore **server-rendered into the page/API response**, not retrieved by a separate XHR. There is no lightweight "stock for SKU X" call to piggyback on.

5. **Can the deployed site fetch this directly from the browser?**
   → **No — this is the blocker.** With a browser-style `Origin: https://snuffish.github.io`, both the PDP and the `/api/` route return **zero `access-control-*` headers** (counted programmatically: `0`). Full header dump on the API shows `server: cloudflare`, `cf-cache-status: DYNAMIC`, `content-type: application/json` — and no CORS grant. A `fetch()` from the deployed origin will be blocked by the browser; `no-cors` mode yields an opaque, unreadable response. **The site is now static on GitHub Pages (`e9de6f2`), so there is no server-side escape hatch in the current architecture.**

6. **How expensive is a full refresh?**
   → **Prohibitive in bulk.** `pageSize` is **fixed server-side at 24** — requesting `pageSize=100` or `500` still returns 24 (`totalPages: 48`, `totalMatching: 1139` for `tradgardsrea`). No search/filter param narrows it: `q=`, `query=` and `searchTerm=` all returned the unfiltered 1 139. So covering all 1 760 products costs **~74 requests / ~20 MB**, and a single product's PDP costs **465 KB**.

7. **Is stock per product or per variant?**
   → **Inconsistently both, and they disagree.** The list API exposes `stockInfo` at *card* (product) level with `hasVariants: false`. The PDP exposes it per *variant* — and on the example product, **`variants[0]` (sku 56943, `stockStatus: "I lager"`) has NO `realTimeInventoryStatus` at all, while `variants[1]` (sku 265790, `stockStatus: "Beställningsvara från odlare"`) has the full 61-store payload.** The app models `Product.variants[]` (`shared/types.ts:41`), so "which variant's stock do we show?" is a real modelling question, not a detail.

---

## 2. Executive Summary (TL;DR)

- **The data exists and is clean** — `stockInfo` on the list API and `realTimeInventoryStatus` on the PDP, both structured, both with the exact Swedish labels in the screenshot.
- **The blocker is CORS, and it is absolute for a pure static site.** Upstream sends no `access-control-*` headers on either route, and GitHub Pages gives us no server to proxy through. **This feature cannot be built without introducing a network hop we control or borrow.**
- **"Live, never cached" and "static, zero-infrastructure" are mutually exclusive here.** Something has to give: either accept a proxy (a small piece of infrastructure), or accept staleness.
- **Granularity is the real design lever.** Fetching stock *on demand for one product when its detail panel opens* is one request — cheap, genuinely live, and matches the screenshot's context. Badging every card in a 1 739-product grid is ~74 requests and is not viable live.

---

## 3. Current-State Architecture & Code Map

Today's flow has no live path at all — everything is read once from the static snapshot:

```
dist/data/products.json  →  useDataset()  →  App  →  runChain()  →  ProductCard / ProductDetail
        (static, committed)                                          (no network after load)
```

| Component / Layer | Source Location | Relevance to this feature |
|---|---|---|
| Domain model | `shared/types.ts:7-45` | `Variant`/`Product` — **no stock field**; this is where a status type would land |
| Grid tile | `src/components/ProductCard.tsx:14-45` | Render target for a per-card badge; already has a `.badge` element for REA at `:29` |
| Detail panel | `src/components/ProductDetail.tsx:28-52` | Render target for full online + per-store status; already links out to the PDP at `:46` |
| Dataset loader | `src/hooks/useDataset.ts:9-40` | Pattern to mirror for an async status hook (loading / error / ready) |
| List-API client | `harvest/fetch-index.ts:16-33` | **Prior art**: walks pages via the response's own `nextApiUrl` rather than constructing URLs |
| PDP client | `harvest/fetch-pdp.ts` + `harvest/extract-state.ts:14` | **Prior art**: the double-decode of `__PRELOADED_STATE__` that already works |
| Upstream shapes | `harvest/upstream.ts:44-51` | `ProductListResponse` — `hasMoreProducts`, `nextApiUrl`, `apiBaseUrl` already typed |
| Hosting | `.github/workflows/deploy.yml`, `vite.config.ts:68` | Static Pages deploy — **no server-side request path exists** |

### 3.1 Identity — can we match a harvested product to a live card?

Yes. `harvest/aggregate.ts:38-40` sets `id` and `url` from `first.url` and keeps `primaryKey`, and `:69` keeps `sku` per variant. The product `url` is a stable join key against the list API's card `url`.

### 3.2 A nuance worth separating

The list API returns store **IDs only** (`storeId`, `optiStoreId`) — **no store names**. Names (`"Arninge"`, `"Skövde"`) appear only in the PDP's `realTimeInventoryStatus.stores[].name`. A store-level UI therefore needs a `storeId → name` directory. **That directory is static reference data** (61 stores, changes rarely) and can be harvested once, even though the stock values themselves must stay live.

---

## 4. Prior Art & Reference Patterns

- **Calling the list API**: `harvest/fetch-index.ts:16-33` — follows `nextApiUrl` and stops on `hasMoreProducts`. Any runtime client should mirror this rather than building page URLs.
- **Decoding a PDP**: `harvest/extract-state.ts:14-38` — the double-decode (`JSON.parse(JSON.parse(...))`) is non-obvious and already correct; reuse, do not reimplement.
- **Async UI state**: `src/hooks/useDataset.ts:9-40` — the `loading | error | ready` discriminated union plus a cancellation flag is the house pattern for a stock hook.
- **Network manners**: `harvest/http.ts:12-17` sets a self-identifying User-Agent and caps concurrency at 5 with the comment *"do not raise casually"*, and `:19` retries on 429. A browser-side client cannot set User-Agent, which is a meaningful departure from the project's existing etiquette.
- **Inconsistency to note**: nothing in `src/` performs a network call today except `useDataset`'s three static JSON reads. This feature introduces the app's first live third-party dependency.

---

## 5. Constraints & Contracts

| Constraint | Impact | Evidence |
|---|---|---|
| **No CORS grant upstream** | Browser cannot read the response from the deployed origin | 0 `access-control-*` headers on PDP and `/api/`, with `Origin:` set |
| **No server in the deployment** | Nowhere to proxy without adding infrastructure | Static Pages deploy, `.github/workflows/deploy.yml` |
| `pageSize` capped at 24 | Bulk refresh ≈ 74 requests / ~20 MB | `pageSize=100` and `=500` both returned 24 |
| No per-product query param | Cannot cheaply fetch one product from the list API | `q`/`query`/`searchTerm` all returned `totalMatching: 1139` |
| PDP costs 465 KB | Per-product live lookup is heavy but viable on demand | measured `size_download=465373` |
| Stock is per-variant upstream, per-card in the list API, and may be **absent** on a variant | Model must tolerate a missing status | `variants[0]` had no `realTimeInventoryStatus` |
| Upstream sets cookies (`EPiServer_Commerce_AnonymousId`, `ARRAffinity`) | Proxying forwards or strips session state; irrelevant for reads but worth not forwarding | header dump |
| `cf-cache-status: DYNAMIC` | Upstream genuinely does not edge-cache this — it *is* live | header dump |

---

## 6. Blast Radius

- **Additive only.** No existing type, filter, sort or chain step changes. `shared/types.ts` gains an optional field or a separate live-status type; `ProductCard`/`ProductDetail` gain a render branch.
- **The filter chain must NOT ingest live stock.** `src/lib/chain.ts` and `runChain` are pure over the static array; making "in stock" a filter step would mean holding live status for all 1 739 products, which §1.6 shows is not feasible. Treat stock as **display-only**.
- **Existing test coverage:** `src/App.test.tsx` reads the static dataset off disk (`:4,13`) and asserts on the grid; there is **no fetch mocking infrastructure anywhere in the suite**. A live-status hook would be the first thing needing it.
- **New failure mode:** the app currently cannot fail after load. Any live call introduces loading/error/timeout states into a UI that has never had them.

---

## 7. Options & Trade-offs

> All four accept the same premise: **a browser on `snuffish.github.io` cannot read blomsterlandet.se directly.** They differ in what they add to bridge that.

### Option A: Own serverless proxy (Cloudflare Worker / Deno Deploy / Vercel Edge) — *Recommended*
- **Concept:** A ~20-line worker on your own free-tier account fetches the upstream URL server-side and re-serves it with `Access-Control-Allow-Origin: https://snuffish.github.io`. The app fetches stock **on demand, for one product, when its detail panel opens**.
- **Pros:** You control it — no third party sees your visitors, no surprise rate limit or shutdown. You can restrict it to an allowlist of blomsterlandet.se paths so it can't be abused as an open relay. Free tiers (Cloudflare: 100k req/day) dwarf this workload. Genuinely live; nothing cached. Can set a sane User-Agent, restoring the etiquette `harvest/http.ts:12` already observes.
- **Cons:** Introduces infrastructure outside the repo — a second thing to deploy, and a secret-free but non-versioned moving part. The site stops being purely "static + GitHub Pages".
- **Follows:** `harvest/http.ts` for fetch discipline; `useDataset.ts` for the hook's state shape.

### Option B: Public/free CORS proxy (corsproxy.io, allorigins, etc.)
- **Concept:** Same client code as A, pointed at a shared public relay instead of your own.
- **Pros:** Zero infrastructure and zero setup — the fastest path to a working demo.
- **Cons:** **Unverified — see the Confidence Ledger.** A third party you don't control sits in your users' critical path, sees every request and their IPs, and can modify responses. Free tiers rate-limit aggressively (a problem given the 24-per-page cap), commonly require registering your origin, and have a history of changing terms or disappearing. Any outage looks like *your* bug.
- **Follows:** nothing in-repo.

### Option C: Refresh stock in CI alongside the data
- **Concept:** A scheduled Actions workflow re-harvests `stockInfo` (74 requests) and commits it into the dataset; the UI reads it statically like everything else.
- **Pros:** No proxy, no new infrastructure, no runtime failure mode, works within the architecture just shipped. Free.
- **Cons:** **Directly contradicts the stated requirement** — the data would be cached and as stale as the cron interval. Also re-scrapes on a schedule, which the previous investigation deliberately avoided.
- **Follows:** the deferred "Option B" from `claude-opus-5-investigation-github-pages-hosting.md`.

### Option D: Don't fetch — link out
- **Concept:** Drop a "Se lagerstatus ↗" affordance next to the existing PDP link (`ProductDetail.tsx:46`), sending the user to the authoritative page.
- **Pros:** Zero cost, zero infrastructure, zero staleness risk, always correct.
- **Cons:** Doesn't deliver the feature; the status isn't visible in-app.

**Recommendation: Option A**, scoped to **on-demand, detail-panel-only** fetching. It is the only option that satisfies "live and uncached" without putting an uncontrolled third party between your users and your site. Scoping it to the detail panel turns the cost problem into a non-problem: one request per product the user actually opens, instead of 74 for a grid. Option B is a legitimate way to *prototype* Option A's client code — the app-side work is identical, so starting on B and swapping the base URL later costs nothing.

---

## 8. Confidence Ledger

| Finding | Level | Evidence / How to verify |
|---|---|---|
| App has no stock modelling today | ✅ Verified | `shared/types.ts:7-45`; zero grep hits across `shared/`, `harvest/upstream.ts`, `src/` |
| PDP carries `realTimeInventoryStatus` with 61 stores | ✅ Verified | Live fetch of the user's URL, decoded via `harvest/extract-state.ts:14` |
| List API carries `stockInfo` for every card | ✅ Verified | `tradgardsrea` page 1 — 24/24 cards, 0 missing |
| Status domain is `inStock \| limitedStock \| onlyOnline \| outOfStock` | ✅ Verified | Enumerated across all cards on page 1 |
| **Upstream sends no CORS headers on either route** | ✅ Verified | Full header dump with `Origin:` set; `access-control` header count = **0** |
| No dedicated inventory XHR endpoint | ✅ Verified | `OmniumInventoryModal_*.js` contains no `fetch` and no URL |
| `pageSize` capped at 24; no per-product query param | ✅ Verified | `pageSize=100/500` → 24; `q`/`query`/`searchTerm` → unfiltered 1 139 |
| Stock may be absent on a variant | ✅ Verified | `variants[0]` (sku 56943) had no `realTimeInventoryStatus` |
| List API omits store names | ✅ Verified | Cards carry `storeId`/`optiStoreId` only; names appear only in PDP `stores[].name` |
| **Public CORS proxies (corsproxy.io, allorigins) would work here** | ❓ **Unknown — not tested** | My probe was **blocked by this session's safety classifier** before any request was made, so I have **no measurement**. Their current rate limits, origin-registration requirements and terms are also outside my knowledge. **Verify by hand before depending on one**, e.g. load the app from the deployed origin and watch the network panel |
| A self-hosted Worker would carry correct CORS headers | 🟡 Inferred | True by construction — you author the response headers — but not empirically demonstrated here |
| Upstream tolerance for per-visitor live traffic | ❓ Unknown | `robots.txt` permits `/api/` (prior investigation), but that covered *your* harvest, not traffic proportional to your visitors. Volume is low for a hobby site; no rate limit was observed |
| Whether stock should be per-variant or rolled up per product | ❓ Unknown | **Product decision — yours.** See §9 |

---

## 9. Open Questions for User

1. **Where should status appear — detail panel only, or grid badges too?** This is the cost decision, not a cosmetic one. Detail-panel-only is one live request per opened product. Grid badges for 60 visible cards need the list API and cannot be kept truly live at 24 products per request. My recommendation is detail-panel-only, matching your screenshot.
2. **Online status only, or the full 61-store breakdown?** Online-only is a single line ("I lager"). The per-store list additionally needs a `storeId → name` directory harvested as static reference data (§3.2), and probably a store picker to be useful — a meaningfully larger feature.
3. **Are you willing to run a small proxy of your own?** This is the fork in the road. If yes → Option A. If you want zero infrastructure and accept a third party in the path → Option B, with the caveat that I could not test it. If neither → the feature reduces to Option C (cached, contradicting your requirement) or D (link out).

---

## 10. Plan Seed

- 1. Decide the fetch granularity and the bridge (§9) — everything downstream depends on these two answers.
- 2. Define a live-status type in `shared/types.ts`, kept **separate** from the harvested `Product` so the static dataset and live data never blur.
- 3. Add a typed upstream reader that reuses `harvest/extract-state.ts` for the PDP shape, or the `nextApiUrl` walk from `harvest/fetch-index.ts` for the list shape.
- 4. Add a status hook mirroring `useDataset`'s `loading | error | ready` union, with abort-on-unmount and an explicit timeout.
- 5. Render in `ProductDetail` (and optionally `ProductCard`), including the states the app has never had: pending, failed, and "upstream reports nothing for this variant".
- 6. Establish fetch mocking in the test suite — none exists today — and cover the missing-status and request-failure paths.
- 7. Keep live status **out of** `src/lib/chain.ts`; it is display-only, not a filter dimension.
