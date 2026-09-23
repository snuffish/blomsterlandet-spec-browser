import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LiveStock } from '~shared/types';
import { fetchStock, stockEnabled } from '~/lib/stock';

export const stockQueryKey = (productUrl: string | null) => ['stock', productUrl] as const;

export function useCardStock(productUrl: string | null, isVisible: boolean): {
  stock: LiveStock | null;
  loading: boolean;
} {
  const enabled = stockEnabled() && !!productUrl && isVisible;

  const { data, isLoading } = useQuery<LiveStock | null>({
    queryKey: stockQueryKey(productUrl),
    queryFn: async ({ signal }) => {
      try {
        return await fetchStock(productUrl!, signal, 'default');
      } catch {
        return null;
      }
    },
    enabled,
    staleTime: 1000 * 60 * 15, // 15 min cache
    retry: 1,
  });

  return {
    stock: data ?? null,
    loading: isLoading && enabled,
  };
}

export function usePrefetchStock() {
  const client = useQueryClient();
  return (productUrl: string) => {
    if (!stockEnabled() || !productUrl) return;
    client.prefetchQuery({
      queryKey: stockQueryKey(productUrl),
      queryFn: ({ signal }) => fetchStock(productUrl, signal, 'default'),
      staleTime: 1000 * 60 * 15,
    });
  };
}
