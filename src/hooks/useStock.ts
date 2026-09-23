import { useEffect, useState } from 'react';
import type { LiveStock } from '~shared/types';
import { fetchStock, NoStockError, stockEnabled } from '~/lib/stock';

export type StockState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stock: LiveStock };

/** This call crosses two networks we don't control, so it gets a deadline of its own. */
const TIMEOUT_MS = 20_000;

/**
 * Fetch one product's live stock. Deliberately keyed on a single product URL rather than the
 * grid: stock is read only for a product the user actually opened, which keeps traffic
 * proportional to genuine interest.
 */
export function useStock(productUrl: string | null): StockState {
  const [state, setState] = useState<StockState>(() =>
    stockEnabled() ? { status: 'loading' } : { status: 'disabled' },
  );

  useEffect(() => {
    if (!stockEnabled() || !productUrl) {
      setState(stockEnabled() ? { status: 'loading' } : { status: 'disabled' });
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    setState({ status: 'loading' });

    fetchStock(productUrl, controller.signal)
      .then((stock) => setState({ status: 'ready', stock }))
      .catch((error: Error) => {
        // Closing the panel aborts in flight; that is not a failure worth rendering.
        if (controller.signal.aborted && error.name === 'AbortError') return;
        setState(
          error instanceof NoStockError
            ? { status: 'missing' }
            : { status: 'error', message: error.message },
        );
      })
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [productUrl]);

  return state;
}
