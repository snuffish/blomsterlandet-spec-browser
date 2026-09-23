# Implementation Plan: Host the Växtregister on GitHub Pages

**Status:** Awaiting User Review
**Date:** 2026-09-23
**Suffix:** `github-pages-hosting`
**Investigation:** [claude-opus-5-investigation-github-pages-hosting.md](claude-opus-5-investigation-github-pages-hosting.md)
**Target URL:** `https://snuffish.github.io/blomsterlandet-spec-browser/`

---

## 1. Context & Goal

Publish the existing Vite + React spec-browser as a static site on GitHub Pages, served from the
`snuffish/blomsterlandet-spec-browser` repository, with the harvested dataset committed as a
snapshot so deploys never touch `blomsterlandet.se`.

### Decisions locked (from `/investigate` §9, confirmed by the user)

| Decision | Choice | Consequence |
|---|---|---|
| Data delivery | **Option A** — commit the snapshot, Actions builds + deploys only | Deploys are hermetic; refreshing data is a local `npm run harvest` + commit |
| Publish scope | **Proceed publicly**, no extra attribution work | Dataset and site are publicly readable; images stay hotlinked to the source CDN |
| Repo visibility | **Public** (resolved, not assumed) | Pages is available on the free tier; no plan upgrade needed |

### Facts verified during planning (no longer inferences)

| Claim | How it was verified | Result |
|---|---|---|
| Repo is public, `main`, Pages not yet enabled | `GET api.github.com/repos/snuffish/blomsterlandet-spec-browser` | `private: false`, `default_branch: main`, `has_pages: false`, size 90 KB |
| Default build emits root-absolute asset URLs | `npx vite build` into the scratchpad | `src="/assets/index-*.js"`, `href="/assets/index-*.css"` — **would 404 under the sub-path** |
| A relative base fixes it | `npx vite build --base=./` into the scratchpad | `src="./assets/index-*.js"`, `href="./assets/index-*.css"` |
| `public/data/` is copied into the build output | Same probe build | `dist/data/{products,facets,meta}.json` present, 3.5 MB |
| The typecheck gate passes | `npx tsc -b --force` | exit 0 |
| The test suite is green | `npm test` | 60 tests / 4 files passed |
| **The test suite reads the dataset off disk** | `src/App.test.tsx:4,13` — `readFileSync(cwd/public/data/meta.json)` | CI cannot run tests unless the data is committed — **independently confirms Option A** |
| Pages 301-redirects a bare project path to trailing slash | `curl -I` against three live Pages sites (monaco-editor, dom-examples, mkdocs-material) | All `301 -> .../` — so relative asset **and** data paths resolve correctly |

### Bundle budget (measured)

| Artifact | Raw | Gzipped |
|---|---|---|
| `assets/index-*.js` | 246.88 kB | 77.31 kB |
| `assets/index-*.css` | 12.16 kB | 3.29 kB |
| `data/products.json` | 3 479 517 B | 379 729 B |
| `data/facets.json` + `meta.json` | 25 581 B | 5 373 B |

---

## 2. Proposed Changes

Four changes, then one manual step in the GitHub UI. No application logic changes — `src/` is
touched only by the optional step 5.

### Step 1 — Set a relative base in `vite.config.ts`

Add a single `base` key to the `defineConfig` object (currently starting at `vite.config.ts:66`,
which has no `base`):

```ts
export default defineConfig({
  // Served from a repository sub-path on GitHub Pages, so assets must resolve
  // relative to index.html rather than the domain root.
  base: './',
  plugins: [react(), harvestEndpoint()],
  // ...unchanged
});
```

**Why `'./'` rather than `'/blomsterlandet-spec-browser/'`:** the dataset fetches in
`src/hooks/useDataset.ts:23-25` are already relative, so the page is portable to any path. A
relative base keeps the *whole* build portable — `vite preview`, a future custom domain at the
root, and the Pages sub-path all work from one config, with no repository name hardcoded into
source. The trailing-slash dependency this introduces is real but already present via the data
fetches, and is neutralised by the Pages 301 verified above.

### Step 2 — Stop ignoring the dataset

In `.gitignore`, remove the `public/data/` line (currently `.gitignore:5`). **Leave
`harvest/cache/` ignored** (`.gitignore:3`) — that is 767 MB of scraped HTML across 1 825 files
and must never enter the repo.

```diff
 node_modules/
 dist/
 harvest/cache/
-public/data/
 *.local
 .DS_Store
```

### Step 3 — Commit the dataset snapshot

Stage and commit the three files (~3.5 MB total):

- `public/data/products.json`
- `public/data/facets.json`
- `public/data/meta.json`

Optionally add a `.gitattributes` marking them as generated, so GitHub collapses them in diffs
and excludes them from language statistics rather than rendering a 3.5 MB blob:

```gitattributes
public/data/*.json linguist-generated=true -diff
```

### Step 4 — Add the deploy workflow

New file `.github/workflows/deploy.yml`. Build-and-deploy on push to `main`, plus manual dispatch.

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

# Let an in-flight deploy finish rather than cancelling it mid-publish.
concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci
      - run: npm test
      - run: npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

Notes behind these choices:
- **Node 22** matches the local toolchain (v22.18.0); `package.json` declares no `engines` field, so the version is pinned here instead.
- **`npm ci`** is viable — `package-lock.json` is present at `lockfileVersion: 3`.
- **`npm test` as a gate** is free (4.3 s, 60 tests) and works *because* step 3 commits the data the suite reads at `src/App.test.tsx:13`.
- **`npm run build`** is `tsc -b && vite build` (`package.json:9`); `tsc -b` walks both project references, so CI needs the full devDependency set — which `npm ci` installs.
- **No `.nojekyll` needed** — the `upload-pages-artifact` → `deploy-pages` path bypasses Jekyll entirely, unlike a branch-based source.

### Step 5 — Optional: drop the dev-only harvest button from the production tree

No action strictly required. `src/App.tsx:54` already gates `<HarvestButton>` behind
`import.meta.env.DEV`, and `vite.config.ts:29` keeps the `/__harvest` middleware to `serve` only,
so neither ships. Listed here only so the review can confirm it was considered, not overlooked.

### Step 6 — Enable Pages (manual, in the GitHub UI)

**This one is yours to do** — `gh` is not installed on this machine and the API route needs a
token. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
Doing this before the first push avoids a failed initial run.

---

## 3. Verification Plan

### Local, before pushing

| # | Check | Command | Expected |
|---|---|---|---|
| 1 | Typecheck + build succeed | `npm run build` | exit 0 |
| 2 | **Assets are relative** | `grep -oE '(src\|href)="[^"]*"' dist/index.html` | `./assets/…`, no leading-slash form |
| 3 | Dataset lands in the build | `ls -la dist/data/` | three JSON files, `products.json` ≈ 3.5 MB |
| 4 | Tests green | `npm test` | 60 passed |
| 5 | **Sub-path smoke test** — the real risk, exercised locally | `npx vite preview --base=/blomsterlandet-spec-browser/` then open the printed URL | Grid renders; no 404s for `assets/*` or `data/*.json` in the network panel |
| 6 | Data is staged, cache is not | `git status --short` | `public/data/*.json` added; **no** `harvest/cache` entries |

### After the first deploy

| # | Check | How | Expected |
|---|---|---|---|
| 7 | Workflow succeeds | Actions tab | `build` and `deploy` both green |
| 8 | Site loads the dataset | Open `https://snuffish.github.io/blomsterlandet-spec-browser/` | Masthead shows the plant count, not the *"Datasetet saknas"* branch (`src/App.tsx:36`) |
| 9 | Bare path redirects | `curl -sI https://snuffish.github.io/blomsterlandet-spec-browser` | `301` → trailing-slash URL |
| 10 | JSON is served gzipped | `curl -sI -H 'Accept-Encoding: gzip' .../data/products.json` | `content-encoding: gzip` |
| 11 | **Deep link restores a chain** | Build a filter chain, copy the `?k=…` URL, open in a clean profile | Same filtered result; `src/lib/chain-url.ts` round-trips |
| 12 | Images resolve | Visual check of the grid | Thumbnails load from `blomsterlandet.se` (`src/lib/format.ts:12-13`) |

---

## 4. Risks & Residual Unknowns

| Risk | Likelihood | Mitigation |
|---|---|---|
| Nothing in the test suite guards the `base` setting — a future revert silently breaks the deploy | Medium | Verification check #2 catches it manually today. A CI assertion on `dist/index.html` could be added later; out of scope here |
| Upstream blocks hotlinked images or moves CDN paths → empty tiles | Low–Medium | Outside our control; `ProductCard.tsx:20-21` already renders a 🌿 placeholder when `product.image` is absent, though not on a failed load |
| Data goes stale — `meta.json` records the campaign ending **11/10** | **Certain, on a known date** | Accepted under Option A: refresh is a deliberate local `npm run harvest` + commit. A scheduled refresh workflow was explicitly deferred |
| Repo grows ~3.5 MB per data refresh | Low | Snapshot commits are infrequent by design; `.gitattributes` keeps diffs collapsed |
| Pages not enabled before first push → red first run | Low | Step 6 does it first; the run is re-triggerable via `workflow_dispatch` |

---

## 5. Out of Scope

- Any scheduled/automated re-harvest workflow (user deferred it).
- Source attribution or licensing copy in the UI (user chose to proceed without).
- A custom domain, analytics, or `robots.txt` / `noindex` policy for the published site.
- Splitting or paginating `products.json` — 380 KB gzipped needs no optimisation.
- Any change to `harvest/`, the filter engine, or the component tree.

---

## 6. Execution Checklist

- [ ] 1. Add `base: './'` to `vite.config.ts`
- [ ] 2. Remove `public/data/` from `.gitignore` (keep `harvest/cache/`)
- [ ] 3. Commit the three dataset files (+ optional `.gitattributes`)
- [ ] 4. Add `.github/workflows/deploy.yml`
- [ ] 5. Run local verification checks 1–6
- [ ] 6. **(User)** Enable Pages with the GitHub Actions source
- [ ] 7. Push to `main`; run post-deploy checks 7–12
