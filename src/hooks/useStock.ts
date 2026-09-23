import { useQuery } from '@tanstack/react-query';
import type { LiveStock } from '~shared/types';
import { fetchStock, NoStockError, stockEnabled } from '~/lib/stock';
import { stockQueryKey } from './useCardStock';

export type StockState =
  | { status: 'disabled' }
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; stock: LiveStock };

export function useStock(productUrl: string | null): StockState {
  const enabled = stockEnabled() && !!productUrl;

  const query = useQuery<LiveStock>({
    queryKey: stockQueryKey(productUrl),
    queryFn: ({ signal }) => fetchStock(productUrl!, signal, 'default'),
    enabled,
    staleTime: 1000 * 60 * 15,
    retry: false,
  });

  if (!stockEnabled()) return { status: 'disabled' };
  if (!productUrl || query.isLoading) return { status: 'loading' };

  if (query.isError) {
    if (query.error instanceof NoStockError) return { status: 'missing' };
    return { status: 'error', message: query.error.message };
  }

  if (query.data) return { status: 'ready', stock: query.data };
  return { status: 'loading' };
}
