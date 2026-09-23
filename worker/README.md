# blomsterlandet-stock — CORS bridge for live stock

The spec-browser is a static GitHub Pages site. Blomsterlandet sends no `access-control-*`
headers, so a browser on `snuffish.github.io` cannot read product pages directly. This Worker
is the bridge.

It **parses rather than relays**: a product page is ~465 KB of HTML; the stock block inside is
~12 KB (1.4 KB gzipped). Extracting here instead of in the browser cuts the visitor's payload
by roughly 38x, and reuses `shared/stock.ts` so there is only one parser to maintain against
upstream's markup.

## Guarantees

- **Allowlisted**: only `https://www.blomsterlandet.se/produkter/*`. Anything else is a 400, so
  this cannot be used as a general-purpose open relay.
- **Scoped CORS**: responses are readable only by the deployed site and localhost dev, never `*`.
- **Never cached**: `cache-control: no-store`, no KV, no Cache API. Liveness is the whole point.
- **Identifies itself**: same User-Agent as `harvest/http.ts`.

## Develop and deploy

```bash
cd worker
wrangler dev            # local, http://localhost:8787
wrangler deploy         # needs `wrangler login` first
```

Then point the app at it by setting `VITE_STOCK_API` at **build** time (Vite inlines it):

```bash
VITE_STOCK_API=https://blomsterlandet-stock.<subdomain>.workers.dev npm run build
```

Leaving `VITE_STOCK_API` unset disables the feature and the app behaves exactly as before.

> This Worker is **not** deployed by the Pages workflow. Changes here need `wrangler deploy`.
