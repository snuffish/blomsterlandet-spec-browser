import { BASE_URL, fetchJson } from './http';
import type { Campaign } from './discover';
import type { ProductListResponse, UpstreamCard } from './upstream';

export interface IndexedCard {
  campaign: string;
  card: UpstreamCard;
}

/**
 * Walk one campaign's listing by following the response's own `nextApiUrl` rather than
 * constructing page URLs — the API is self-describing and that keeps us honest if it changes.
 */
export async function fetchCampaignIndex(
  campaign: Campaign,
  useCache: boolean,
): Promise<IndexedCard[]> {
  const collected: IndexedCard[] = [];
  let next: string | undefined = `${campaign.apiBaseUrl}?page=1&sorting=Name&filterDefaults=false`;

  while (next) {
    const page: ProductListResponse = await fetchJson<ProductListResponse>(BASE_URL + next, {
      useCache,
    });
    for (const card of page.products ?? []) {
      collected.push({ campaign: campaign.slug, card });
    }
    next = page.hasMoreProducts ? page.nextApiUrl : undefined;
  }
  return collected;
}
