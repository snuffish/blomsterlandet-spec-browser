# Trädgårdsrea — Växtregister

A local, browsable index of every plant in Blomsterlandet's *Trädgårdsrea* campaign,
filterable and sortable by specification — the thing the source site doesn't let you do.

**Live:** <https://snuffish.github.io/blomsterlandet-spec-browser/>

**1 739 products · 2 419 variants · 8 campaign categories**

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
slider in the sidebar. 532 of the 1 739 plants qualify.

## The filter chain

Filters and sorts stack into a visible, ordered pipeline. Each step shows how many plants
survive it, so you can see the funnel:

```
0  Alla växter                          1 739
1  Förväntad sluthöjd  1–40              646   −1 093
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
- **Seeing what each step costs you.** The `−1 093` tells you which step is doing the work.

The whole chain serializes to the URL in order, so a pipeline is shareable.

## Commands

| Command | What it does |
| --- | --- |
| `npm run harvest` | Build the dataset. Raw HTML is cached, so re-runs are seconds. |
| `npm run harvest:fresh` | Bypass the cache and refetch everything from the site. |
| `npm run dev` | Dev server with HMR. |
| `npm run build` | Typecheck + production bundle into `dist/`. |
| `npm test` | 40 tests — normalizer, query engine, and the app end-to-end. |

## How it works

```
harvest/  (Node, on demand)  ──>  public/data/*.json  ──>  src/  (React SPA)
```

The two halves are deliberately separate: if Blomsterlandet changes their markup, the
harvester breaks and the UI doesn't.

**Harvesting.** Campaign slugs are read from the site's own pill navigation — they're
editorial, and `barbuskar-tradgardsrea` breaks the pattern its siblings follow. The index
comes from `/api/campaigns/{slug}/products`, following each response's `nextApiUrl`. Specs
come from each product page, where the full view model is embedded as `__PRELOADED_STATE__`
— a JS string literal containing JSON, so it needs `JSON.parse` twice.

**Normalizing.** Display strings can't be sorted as-is. `"2,5 - 3 m"` and `"20 - 25 cm"`
have to become comparable numbers, or a 3-metre tree sorts below a 25-centimetre perennial.
So: decimal commas → dots, every length → centimetres, scalars → degenerate ranges, and
`Krukstorlek` split in two because it mixes diameter (`11 cm`) with volume (`3 liter`).
Values that don't parse are kept as tags rather than dropped.

**Browsing.** The whole catalogue is 346 KB gzipped, so it loads once and every filter runs
in memory. Range filters match by *overlap* by default — asking for 50–60 cm returns a plant
listed as 40–60 cm — with a toggle for strict containment. Filters serialize to the URL.

## Data notes

- Prices are a snapshot. The campaign runs *t.o.m 11/10*; the footer shows the harvest date.
- `Förväntad sluthöjd` covers 97.6% of products. Plants missing a spec are excluded from
  filters on it and sink to the bottom when sorting by it.
- 153 products have variants that disagree on a dimension. The range shown is the union, and
  the detail panel flags it.
- Personal use. The dataset isn't meant for redistribution.

## Layout

```
harvest/    extraction, fetching, normalizing, validation
shared/     types and unit helpers used by both halves
src/        React app — lib/ is pure logic, components/ is UI
```
