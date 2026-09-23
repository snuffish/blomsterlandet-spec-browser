import { useCallback, useEffect, useState } from 'react';
import type { Dataset, FacetCatalogue, HarvestMeta, Product } from '~shared/types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: Dataset };

const load = async <T>(path: string, nonce: number): Promise<T> => {
  const response = await fetch(nonce ? `${path}?v=${nonce}` : path);
  if (!response.ok) throw new Error(`${path} — HTTP ${response.status}`);
  return (await response.json()) as T;
};

export function useDataset(): { state: State; reload: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  // Bumped after a harvest; doubles as the cache-buster for the re-fetch.
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      load<Product[]>('data/products.json', nonce),
      load<FacetCatalogue>('data/facets.json', nonce),
      load<HarvestMeta>('data/meta.json', nonce),
    ])
      .then(([products, facets, meta]) => {
        if (!cancelled) setState({ status: 'ready', data: { products, facets, meta } });
      })
      .catch((error: Error) => {
        if (!cancelled) {
          setState({
            status: 'error',
            message: `${error.message}. Kör \`npm run harvest\` för att bygga datasetet.`,
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  // Deliberately leaves the current dataset on screen until the new one lands.
  const reload = useCallback(() => setNonce(Date.now()), []);

  return { state, reload };
}
