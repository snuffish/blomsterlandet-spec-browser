# Trädgårdsrea — Växtregister

A browsable index of every plant in Blomsterlandet's *Trädgårdsrea* campaign, filterable and
sortable by specification — the thing the source site doesn't let you do — with live stock
per store.

**Live:** <https://snuffish.github.io/blomsterlandet-spec-browser/>

**1 760 products · 2 494 variants · 8 campaign categories · 61 stores**
*(snapshot harvested 2026-09-23)*

## Why it exists

Blomsterlandet's campaign listing offers six sort options (name, price, scientific name) and
**no specification filtering at all**. The specs you'd actually shop by — expected final height,
light position, flowering season — live only on individual product pages. This harvests them
into one dataset and puts a real filter UI in front of it.

## Quick start

```bash
npm install
npm run harvest     # ~2 min first run, seconds thereafter (cached)
npm run dev         # http://localhost:5173
```

Answering the original question — *plants that end up 50–60 cm tall* — is the height
slider in the sidebar. 532 of the 1 760 plants qualify.

## The filter chain

Filters and sorts stack into a visible, ordered pipeline. Each step shows how many plants
survive it, so you can see the funnel:

```
0  Alla växter                          1 760
1  Förväntad sluthöjd  1–40              646   −1 114
2  Sortera  pris stigande   [primär]     646
3  Behåll  de 20 första                   20   −626
```

Sidebar filters append to the chain automatically. The **+ Lägg till steg** button adds
sorts and a *behåll de N första* step. Any step can be reordered, switched off without
losing it, or removed.

Three things the chain makes possible that a flat filter bar can't:

- **Tiered sorting.** Stack several sorts: the first decides, the rest break its ties.
  *Sort by height, then by price* is not the same as *by price, then by height*.
- **Order that matters.** Pure filters commute, but a `behåll`-step doesn't — *filter, sort
  by price, keep 20* gives the 20 cheapest; moving the keep above the sort gives 20
  arbitrary plants sorted by price.
- **Seeing what each step costs you.** The `−1 114` tells you which step is doing the work.

The whole chain serializes to the URL in order, so a pipeline is shareable.

## Live stock

The harvested specs are a snapshot. Stock isn't, so it's fetched live:

- **Product cards** show a badge (*I lager i Arninge*, *Slut i …*) once they scroll into view.
  Results are cached for 15 minutes.
- **The detail panel** has a *Lagerstatus* section listing stock per store, grouped by region.
- **The Butiker picker** in the sidebar picks which stores you care about. It's a preference,
  not a chain step: it never narrows the plant grid, only what the stock badge and panel
  report on. The choice is kept in `localStorage`. With nothing picked, the panel lists every
  store that has the plant in stock.

Blomsterlandet sends no CORS headers, so the browser can't read product pages directly. A
small Cloudflare Worker in [`worker/`](worker/README.md) fetches the page, extracts the stock
block with the same parser the harvester uses (`shared/stock.ts`), and returns ~1.4 KB instead
of ~465 KB. The app points at it through `VITE_STOCK_API`, which is inlined at **build** time.
When it's unset, the stock UI isn't shown and everything else works as before.

## Commands

| Command | What it does |
| --- | --- |
| `npm run harvest` | Build the dataset. Raw HTML is cached, so re-runs are seconds. |
| `npm run harvest:fresh` | Bypass the cache and refetch everything from the site. |
| `npm run dev` | Dev server with HMR. Also has a *re-harvest* button (dev only, not in the build). |
| `npm run build` | Typecheck + production bundle into `dist/`. |
| `npm run preview` | Serve the production bundle locally. |
| `npm test` | Vitest: normalizer, query engine, chain, stock parser, Worker, and the app end-to-end. |
| `npm run test:watch` | Same, in watch mode. |

## How it works

```
harvest/  (Node, on demand)  ──>  public/data/*.json  ──>  src/  (React SPA)
                                                             │
                              worker/  (Cloudflare)  <───────┘  live stock only
```

The halves are deliberately separate: if Blomsterlandet changes their markup, the
harvester breaks and the UI doesn't.

**Harvesting.** Campaign slugs are read from the site's own pill navigation. They're
editorial, and `barbuskar-tradgardsrea` breaks the pattern its siblings follow. The index
comes from `/api/campaigns/{slug}/products`, following each response's `nextApiUrl`. Specs
come from each product page, where the full view model is embedded as `__PRELOADED_STATE__`:
a JS string literal containing JSON, so it needs `JSON.parse` twice. The store directory
(`stores.json`) is built from the inventory blocks of those same pages, so it costs no
extra requests.

**Normalizing.** Display strings can't be sorted as-is. `"2,5 - 3 m"` and `"20 - 25 cm"`
have to become comparable numbers, or a 3-metre tree sorts below a 25-centimetre perennial.
So: decimal commas → dots, every length → centimetres, scalars → degenerate ranges, and
`Krukstorlek` split in two because it mixes diameter (`11 cm`) with volume (`3 liter`).
Values that don't parse are kept as tags rather than dropped.

**Browsing.** The whole catalogue is about 380 KB gzipped, so it loads once and every filter
runs in memory. Range filters match by *overlap* by default: asking for 50–60 cm returns a
plant listed as 40–60 cm. A toggle switches to strict containment. Filters serialize to the URL.

## Deployment

Every push to `main` runs [`deploy.yml`](.github/workflows/deploy.yml): `npm ci` →
`npm test` → `npm run build` → GitHub Pages. The dataset is committed under `public/data/`,
so CI never scrapes. Refresh it by running `npm run harvest` locally and committing the result.

`VITE_STOCK_API` comes from a repository variable of the same name. The Worker is **not**
deployed by this workflow. Run `wrangler deploy` from `worker/` after changing it.

## Data notes

- Prices are a snapshot. The campaign ran *t.o.m 11/10* (2026-10-11) and has ended, so the
  campaign prices shown are no longer valid. The footer shows the harvest date.
- `Förväntad sluthöjd` covers 97.6% of products. Plants missing a spec are excluded from
  filters on it and sink to the bottom when sorting by it.
- 171 products have variants that disagree on a dimension. The range shown is the union, and
  the detail panel flags it.
- Personal use. The dataset isn't meant for redistribution.

## Layout

```
harvest/       extraction, fetching, normalizing, validation, store directory
shared/        types, unit helpers and the stock parser used by every half
src/           React app: lib/ is pure logic, hooks/ is state and fetching, components/ is UI
public/data/   the committed dataset (products, facets, stores, meta)
worker/        Cloudflare Worker: CORS bridge for live stock
```
