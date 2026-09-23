# Implementation Plan: Live "Lagerstatus" in the product detail panel

**Status:** Awaiting User Review
**Date:** 2026-09-23
**Suffix:** `live-stock-status`
**Investigation:** [claude-opus-5-investigation-live-stock-status.md](claude-opus-5-investigation-live-stock-status.md)

---

## 1. Context & Goal

Show each product's real, uncached stock status — online plus all 61 stores — in the detail
panel, fetched live from blomsterlandet.se at the moment the panel opens. Upstream sends no CORS
headers, and the site is static on GitHub Pages, so the bridge is a Cloudflare Worker on your own
account.

### Decisions locked (user-confirmed)

| Decision | Choice |
|---|---|
| CORS bridge | **Own Cloudflare Worker** — allowlisted, ACAO scoped to the Pages origin |
| Placement | **Detail panel only** — one live request per product the user opens |
| Depth | **Online status + all 61 stores** |

### Facts established during planning

| Claim | Verification | Result |
|---|---|---|
| **Exactly one variant per product carries the stock payload** | Parsed **389 cached PDPs** via `harvest/extract-state.ts` | 300/300 single-variant products have it on their one variant; 89/89 multi-variant products have it on **only some** — and **never on more than one**. So `variants.find(v => v.realTimeInventoryStatus)` is unambiguous, and no two variants can ever disagree |
| No product lacks stock data entirely | Same sweep | **0 of 389** had no payload on any variant |
| Store names/addresses come free with the PDP | `stores[0]` keys | `storeId, name, url, address, zipCode, city, region, inventoryStatus, inventoryStatusLabel, hasClickAndReserve` |
| A parsing Worker beats a relaying Worker by 38× | Measured the extracted block | PDP 465 373 B → trimmed stock JSON **12 370 B (1 410 B gzipped)** |
| `extract-state.ts` has only two importers | grep | `harvest/discover.ts:1`, `harvest/fetch-pdp.ts:1` — cheap to relocate |
| `shared/` has no dependency on `harvest/` | grep | Clean — so `shared/` can host the parser without a cycle |

### Two corrections to the investigation

1. **No static store directory is needed.** §3.2 of the investigation flagged that store names would
   have to be harvested separately. That applies only to the *list API* route, which this plan does
   not take — the PDP ships full store records inline. **That workstream is deleted.**
2. **The test suite already stubs `fetch` globally.** The investigation said there was no fetch
   mocking anywhere; in fact `src/test-setup.ts:14` installs a `vi.stubGlobal('fetch', …)` that maps
   any URL onto a file in `public/data/`. That stub will throw `ENOENT` on a stock URL, so it must be
   extended rather than introduced — a different and smaller task than the investigation implied.

---

## 2. Proposed Changes

### Step 1 — Move the state parser into `shared/`

`git mv harvest/extract-state.ts shared/extract-state.ts`, update the two importers
(`harvest/discover.ts:1`, `harvest/fetch-pdp.ts:1`) to `~shared/extract-state`.

**Why:** the Worker must parse `__PRELOADED_STATE__`, and that logic already exists and is subtly
correct (the double-decode at `harvest/extract-state.ts:14-38`). Relocating it lets the Worker and
the harvest share one implementation instead of maintaining two parsers against the same fragile
upstream shape. `shared/` is already dependency-free of `harvest/`, and `tsconfig.node.json:16`
already includes `shared`, so the harvest side keeps compiling unchanged.

### Step 2 — Define the live-status contract in `shared/types.ts`

Add types kept **deliberately separate** from `Product`, so static harvested data and live data
never blur into one object:

```ts
export type InventoryStatus = 'inStock' | 'limitedStock' | 'onlyOnline' | 'outOfStock';

export interface StoreStock {
  id: string;
  name: string;
  city: string;
  region: string;
  url: string;
  status: InventoryStatus;
  /** Upstream's own Swedish wording — displayed verbatim, never re-derived. */
  label: string;
}

export interface LiveStock {
  online: InventoryStatus;
  onlineLabel: string;
  storesHeader: string;
  stores: StoreStock[];
  /** When the Worker fetched it — this data is deliberately never cached. */
  fetchedAt: string;
}
```

`InventoryStatus` is a closed union because all four values were enumerated from live data; any
unrecognised value must be surfaced rather than silently coerced (see Step 5).

### Step 3 — The Cloudflare Worker (`worker/`)

A new `worker/` directory in this repo, deployed separately with `wrangler` (**not** by the Pages
workflow — see §4). Responsibilities, in order:

1. **Allowlist the target.** Accept only a `?url=` whose origin is exactly
   `https://www.blomsterlandet.se` and whose path starts with `/produkter/`. Reject everything else
   with 400. This is what stops the Worker being an open relay.
2. **Restrict the caller.** `Access-Control-Allow-Origin: https://snuffish.github.io` (plus
   `http://localhost:5173` for dev), not `*`.
3. **Fetch with manners.** Set the same self-identifying User-Agent as `harvest/http.ts:12-14` — a
   browser cannot set that header, which is precisely why the Worker should.
4. **Parse and trim.** Run `extractPreloadedState`, take
   `variants.find(v => v.realTimeInventoryStatus)`, and return the `LiveStock` shape. This is the
   38× reduction — the visitor receives ~12 KB instead of ~465 KB.
5. **Never cache.** `Cache-Control: no-store`, and no Cloudflare Cache API usage. The whole point of
   the feature is liveness.
6. **Fail honestly.** Distinguish upstream-unavailable (502), bad request (400) and
   no-stock-found (200 with an explicit empty result) so the UI can say different things.

### Step 4 — `src/lib/stock.ts`: the client

A thin typed client. Single exported `fetchStock(productUrl, signal)`. The Worker base URL lives in
**one** constant so it can be repointed without touching anything else:

```ts
const STOCK_API = import.meta.env.VITE_STOCK_API ?? '';
```

Reading it from an env var means the Worker URL is configuration, not source, and an unset value
cleanly disables the feature (Step 6).

### Step 5 — `src/hooks/useStock.ts`

Mirrors the house pattern in `src/hooks/useDataset.ts:9-40`: a `loading | error | ready`
discriminated union with a cancellation flag. Additions the existing hook does not need:

- An `AbortController` tied to the effect, so closing the panel cancels the request.
- An explicit timeout, since this call crosses two networks the app does not control.
- Fires **only when a product is selected** — never on mount, never for the grid.

### Step 6 — Render in `ProductDetail.tsx`

A new `<section>` following the existing `Mått` section (`src/components/ProductDetail.tsx:54`),
placed directly above the outbound link at `:46`. It must render **five** states, four of which the
app has never had:

| State | Treatment |
|---|---|
| Feature disabled (`VITE_STOCK_API` unset) | Render nothing — the app degrades to exactly today's behaviour |
| Loading | Inline skeleton/"Hämtar lagerstatus…"; must not shift the panel layout |
| Ready | `Online ● I lager`, then `Butikslager` with the 61 stores grouped by `region` |
| Upstream returned no stock for this product | Explicit "Lagerstatus saknas" — **not** silently blank |
| Request failed/timed out | Short message plus the existing PDP link as the fallback path |

Status colours reuse the existing `.badge` conventions in `src/index.css`; the dot mirrors the
screenshot (green `inStock`, amber `limitedStock`, red `outOfStock`/`onlyOnline`). Labels are
rendered **verbatim from upstream** (`label`, `onlineLabel`) rather than mapped locally, so Swedish
wording stays correct without a translation table.

61 stores is a long list — it goes in a collapsed `<details>` headed by the store count, matching
the site's own "Se butikslager" affordance.

### Step 7 — Extend the test stub and cover the new paths

`src/test-setup.ts:14` currently maps every URL to `public/data/<path>`. Extend it to recognise the
stock endpoint and serve a committed fixture, leaving existing behaviour untouched. Then cover:

- the one-variant-with-stock selection rule (the core logic worth a unit test),
- a product whose payload is missing → "Lagerstatus saknas",
- a failed request → error branch,
- an unknown `inventoryStatus` value → surfaced, not crashed.

### Step 8 — Do **not** touch the filter chain

`src/lib/chain.ts` stays pure over the static array. Live stock is display-only. Making it a filter
step would require holding live status for all 1 739 products, which the 24-per-page cap makes
infeasible — this is a deliberate exclusion, recorded so it is not "fixed" later by accident.

---

## 3. Verification Plan

### Worker, before wiring the UI

| # | Check | Expected |
|---|---|---|
| 1 | `curl "$WORKER?url=<the Afghanperovskia PDP>"` | 200, `LiveStock` JSON, ~12 KB |
| 2 | Response carries `access-control-allow-origin: https://snuffish.github.io` | present — the entire point |
| 3 | `Cache-Control` | `no-store` |
| 4 | Two calls a minute apart | `fetchedAt` differs — proves nothing is cached |
| 5 | **Allowlist holds**: `?url=https://example.com/` | 400, not a fetch |
| 6 | `?url=` pointing at a non-`/produkter/` path | 400 |
| 7 | Payload matches the live PDP | `online` and a spot-checked store agree with the real page |

### App

| # | Check | Expected |
|---|---|---|
| 8 | `npm test` | existing 60 pass, plus the new cases |
| 9 | `npm run build` | exit 0 |
| 10 | Panel open in dev | status appears; **grid triggers no requests** (network panel) |
| 11 | Open and close quickly | in-flight request aborts; no state-update warning |
| 12 | `VITE_STOCK_API` unset | app behaves exactly as today, no errors |
| 13 | Worker stopped/unreachable | error branch renders; panel still usable |
| 14 | Deployed site, real browser | **no CORS error in console** — the one thing only a real deploy proves |

---

## 4. Risks & Open Points

| Risk | Mitigation |
|---|---|
| **The Worker is infrastructure outside this repo's deploy.** The Pages workflow won't deploy it; a `worker/` change needs `wrangler deploy` | Keep it versioned in `worker/` with a README; optionally add a second workflow later. Flagged now so it doesn't surprise you in three months |
| Upstream HTML shape changes → parser breaks | Shared parser means one place to fix; Worker returns 502 rather than garbage; UI degrades to the PDP link |
| Traffic now scales with *visitors*, not with your harvest runs | Detail-panel-only keeps it proportional to genuine interest. The self-identifying User-Agent keeps it honest. Volume is tiny for this site's traffic |
| `VITE_STOCK_API` must be set at **build** time in CI, not runtime | Vite inlines env vars at build; add it as a repo variable in the deploy workflow. Easy to forget — hence check 12 |
| Worker URL is public and could be called by others | Allowlist (Step 3.1) bounds the blast radius to read-only Blomsterlandet product pages |

**Open point:** I have not verified the Cloudflare free tier's current limits or that your account
has Workers enabled. Everything else here is measured; that one is an assumption to confirm before
you start.

---

## 5. Out of Scope

- Stock badges in the grid, and any list-API usage (explicitly deselected).
- Stock as a filter or sort dimension (Step 8).
- Caching of any kind, including edge caching — contradicts the requirement.
- A store picker or persisted store preference.
- Changes to `harvest/`, beyond the one-file move in Step 1.

---

## 6. Execution Checklist

- [ ] 1. Move `extract-state.ts` to `shared/`, update two importers, confirm `npm test` still green
- [ ] 2. Add `InventoryStatus` / `StoreStock` / `LiveStock` to `shared/types.ts`
- [ ] 3. Write and deploy the Worker; run verification 1–7
- [ ] 4. Add `src/lib/stock.ts` and `src/hooks/useStock.ts`
- [ ] 5. Render the section in `ProductDetail.tsx` with all five states
- [ ] 6. Extend `src/test-setup.ts`; add the new test cases
- [ ] 7. Run verification 8–13 locally
- [ ] 8. Add `VITE_STOCK_API` to the deploy workflow; push; run verification 14
