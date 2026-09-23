import type { InventoryStatus, LiveStock, StoreStock } from '~shared/types';
import { KNOWN_STATUSES } from '~shared/stock';
import { useStock } from '~/hooks/useStock';

interface Props {
  /** The product's path on blomsterlandet.se; `null` while nothing is selected. */
  productUrl: string | null;
}

/**
 * Dot colour per status. An unrecognised status from upstream falls through to `unknown`
 * rather than being dropped — the label still renders verbatim, so a new value degrades
 * to a neutral dot instead of disappearing.
 */
const dotClass = (status: InventoryStatus): string =>
  KNOWN_STATUSES.has(status) ? `dot dot-${status}` : 'dot dot-unknown';

/**
 * "In stock" means the shelf: `limitedStock` ("Fåtal i lager") counts, while `onlyOnline`
 * (stocked nowhere, sold from the web only) and `outOfStock` do not.
 */
const IN_STOCK: ReadonlySet<string> = new Set(['inStock', 'limitedStock']);

const stocked = (stores: StoreStock[]): StoreStock[] =>
  stores.filter((store) => IN_STOCK.has(store.status));

/** Stores come back in upstream order; grouping by region makes them scannable. */
function byRegion(stores: StoreStock[]): Array<[string, StoreStock[]]> {
  const groups = new Map<string, StoreStock[]>();
  for (const store of stores) {
    const key = store.region || 'Övriga';
    groups.set(key, [...(groups.get(key) ?? []), store]);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'sv'));
}

export function StockPanel({ productUrl }: Props) {
  const state = useStock(productUrl);

  // No bridge configured: the feature is simply absent, exactly as before it existed.
  if (state.status === 'disabled') return null;

  return (
    <section className="stock">
      <h3>Lagerstatus</h3>

      {state.status === 'loading' && (
        <p className="stock-pending" role="status">Hämtar lagerstatus…</p>
      )}

      {state.status === 'missing' && (
        <p className="stock-pending">Lagerstatus saknas för den här produkten.</p>
      )}

      {state.status === 'error' && (
        <p className="stock-error" role="alert">
          Kunde inte hämta lagerstatus. {state.message}
        </p>
      )}

      {state.status === 'ready' && <StockReady stock={state.stock} />}

    </section>
  );
}

function StockReady({ stock }: { stock: LiveStock }) {
  // Only shelves that actually hold the product; everything else is noise on a 61-row list.
  const available = stocked(stock.stores);

  return (
    <>
      <p className="stock-online">
        <span>{stock.onlineLabel || 'Online'}</span>
        <span className={dotClass(stock.online)} aria-hidden="true" />
        <strong>{labelFor(stock.online)}</strong>
      </p>

      {available.length === 0 ? (
        <p className="stock-pending">Ingen butik har den i lager just nu.</p>
      ) : (
        <details className="stock-stores">
          <summary>
            {stock.storesHeader || 'Butikslager'}{' '}
            <span className="stock-count">({available.length})</span>
          </summary>
          {byRegion(available).map(([region, stores]) => (
            <div key={region} className="stock-region">
              <h4>{region}</h4>
              <ul>
                {stores.map((store) => (
                  <li key={store.id}>
                    <a href={store.url} target="_blank" rel="noopener noreferrer">
                      {store.name}
                    </a>
                    <span className={dotClass(store.status)} aria-hidden="true" />
                    <span className="stock-label">{store.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </details>
      )}

      <p className="stock-stamp">
        Hämtad {new Date(stock.fetchedAt).toLocaleTimeString('sv-SE')} — live, aldrig cachad.
      </p>
    </>
  );
}

/** Online status has no label of its own upstream; the four known values map to the site's wording. */
function labelFor(status: InventoryStatus): string {
  switch (status) {
    case 'inStock':
      return 'I lager';
    case 'limitedStock':
      return 'Fåtal i lager';
    case 'outOfStock':
      return 'Slut i lager';
    case 'onlyOnline':
      return 'Säljs endast online';
    default:
      return status;
  }
}
