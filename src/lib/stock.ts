import type { LiveStock } from '~shared/types';

const SITE = 'https://www.blomsterlandet.se';

/**
 * The CORS bridge (worker/). Configuration rather than source, so the Worker can be
 * repointed — or the feature switched off — without touching code. Read on each call
 * rather than captured at module load, so tests can vary it.
 */
const stockApi = (): string => import.meta.env.VITE_STOCK_API ?? '';

/** Live stock is only offered when a bridge is configured; otherwise the UI omits it entirely. */
export const stockEnabled = (): boolean => stockApi() !== '';

/** Upstream carries no inventory block for this product — a real case, not a failure. */
export class NoStockError extends Error {}

/**
 * Read one product's stock. Uses the Cloudflare Worker bridge, which edge-caches stock
 * responses for 15 minutes to prevent rate limiting upstream.
 */
export async function fetchStock(
  productUrl: string,
  signal?: AbortSignal,
  cacheMode: RequestCache = 'default',
): Promise<LiveStock> {
  const target = productUrl.startsWith('http') ? productUrl : SITE + productUrl;
  const response = await fetch(`${stockApi()}?url=${encodeURIComponent(target)}`, {
    signal,
    cache: cacheMode,
  });

  const body = (await response.json()) as { stock?: LiveStock | null; error?: string };
  if (!response.ok) throw new Error(body.error ?? `HTTP ${response.status}`);
  if (!body.stock) throw new NoStockError('Ingen lagerstatus för den här produkten.');
  return body.stock;
}
