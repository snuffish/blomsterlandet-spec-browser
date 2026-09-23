import { useDeferredValue, useMemo, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Product } from '~shared/types';
import { ChainPanel } from '~/components/ChainPanel';
import { FilterPanel, PRIMARY_DIM } from '~/components/FilterPanel';
import { HarvestButton } from '~/components/HarvestButton';
import { ProductCard } from '~/components/ProductCard';
import { ProductDetail } from '~/components/ProductDetail';
import { useChain } from '~/hooks/useChain';
import { useDataset } from '~/hooks/useDataset';
import { useStorePrefs } from '~/hooks/useStorePrefs';
import { chainToFilterState, runChain } from '~/lib/chain';
import { formatDate } from '~/lib/format';

const PAGE_SIZE = 60;

function CatalogBrowser() {
  const { state: dataset, reload } = useDataset();
  const chain = useChain();
  const storePrefs = useStorePrefs();
  const [selected, setSelected] = useState<Product | null>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Keeps typing responsive: the grid re-renders at its own pace behind the input.
  const deferredSteps = useDeferredValue(chain.steps);
  const products = dataset.status === 'ready' ? dataset.data.products : null;

  const { products: visible, stages } = useMemo(
    () => (products ? runChain(products, deferredSteps) : { products: [], stages: [] }),
    [products, deferredSteps],
  );

  // The sidebar shows current values; the chain remains the single source of truth.
  const filters = useMemo(() => chainToFilterState(chain.steps), [chain.steps]);

  if (dataset.status === 'loading') {
    return <main className="state"><p>Laddar växtregistret…</p></main>;
  }
  if (dataset.status === 'error') {
    return <main className="state"><h1>Datasetet saknas</h1><p>{dataset.message}</p></main>;
  }

  const { facets, meta } = dataset.data;
  const shown = visible.slice(0, limit);
  const filtered = visible.length !== meta.productCount;

  return (
    <div className="layout">
      <header className="masthead">
        <div>
          <h1>Trädgårdsrea — Växtregister</h1>
          <p className="tagline">
            {meta.productCount.toLocaleString('sv-SE')} växter ur Blomsterlandets trädgårdsrea,
            sökbara på specifikation.
          </p>
        </div>
        {import.meta.env.DEV && <HarvestButton onComplete={reload} />}
      </header>

      <FilterPanel
        products={dataset.data.products}
        facets={facets}
        filters={filters}
        setSearch={chain.setSearch}
        setDim={chain.setDim}
        setTag={chain.setTag}
        setCampaigns={chain.setCampaigns}
        onReset={() => {
          chain.reset();
          setLimit(PAGE_SIZE);
        }}
        stores={dataset.data.stores}
        selectedStores={storePrefs.selected}
        onToggleStore={storePrefs.toggle}
        onClearStores={storePrefs.clear}
      />

      <main className="results">
        <ChainPanel
          facets={facets}
          stages={stages}
          total={dataset.data.products.length}
          onAppend={chain.append}
          onRemove={chain.remove}
          onToggle={chain.toggle}
          onMove={chain.move}
          onUpdate={chain.update}
          onReset={chain.reset}
        />

        <div className="results-head">
          <p className="count">
            <strong>{visible.length.toLocaleString('sv-SE')}</strong>
            {visible.length === 1 ? ' växt' : ' växter'}
            {filtered && ` av ${meta.productCount.toLocaleString('sv-SE')}`}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className="empty">
            <p>Inga växter matchar kedjan.</p>
            <button type="button" className="link" onClick={chain.reset}>Rensa alla steg</button>
          </div>
        ) : (
          <>
            <div className="grid">
              {shown.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  heightSpec={PRIMARY_DIM}
                  onOpen={setSelected}
                  selectedStores={storePrefs.selected}
                  stores={dataset.data.stores}
                />
              ))}
            </div>
            {limit < visible.length && (
              <button type="button" className="more" onClick={() => setLimit(limit + PAGE_SIZE)}>
                Visa fler ({(visible.length - limit).toLocaleString('sv-SE')} kvar)
              </button>
            )}
          </>
        )}
      </main>

      <footer className="provenance">
        <p>
          Data hämtad <time dateTime={meta.harvestedAt}>{formatDate(meta.harvestedAt)}</time> från
          blomsterlandet.se · {meta.variantCount.toLocaleString('sv-SE')} varianter
        </p>
        {meta.promotionNotice && <p className="notice">⚠ {meta.promotionNotice} — priser kan vara inaktuella.</p>}
      </footer>

      {selected && <ProductDetail
          product={selected}
          onClose={() => setSelected(null)}
          selectedStores={storePrefs.selected}
        />}
    </div>
  );
}

export default function App() {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 1000 * 60 * 15,
            gcTime: 1000 * 60 * 30,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <CatalogBrowser />
    </QueryClientProvider>
  );
}
