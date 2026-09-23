import { extractPreloadedState, findComponents } from '../shared/extract-state';
import { BASE_URL, fetchText } from './http';
import type { LinkBlock, ProductListResponse } from './upstream';

export interface Campaign {
  slug: string;
  label: string;
  apiBaseUrl: string;
  totalMatching: number;
  totalPages: number;
}

const ENTRY_PATH = '/kampanjer/tradgardsrea/';

/**
 * Campaign slugs are editorial — "barbuskar-tradgardsrea" breaks the naming pattern its
 * siblings follow — so they are always read from the pill navigation, never constructed.
 */
export async function discoverCampaigns(useCache: boolean): Promise<Campaign[]> {
  const entryUrls = await readPillNavigation(ENTRY_PATH, useCache);
  const campaigns: Campaign[] = [];

  for (const { url, label } of entryUrls) {
    const state = await extractPreloadedState(await fetchText(BASE_URL + url, { useCache }));
    const [list] = findComponents<ProductListResponse>(state, 'ProductListViewModel');
    if (!list?.apiBaseUrl) {
      throw new Error(`No ProductListViewModel with an apiBaseUrl at ${url}`);
    }
    const slug = list.apiBaseUrl.replace(/^\/api\/campaigns\//, '').replace(/\/products$/, '');
    campaigns.push({
      slug,
      label,
      apiBaseUrl: list.apiBaseUrl,
      totalMatching: list.totalMatching,
      totalPages: list.totalPages,
    });
  }
  return campaigns;
}

async function readPillNavigation(
  path: string,
  useCache: boolean,
): Promise<Array<{ url: string; label: string }>> {
  const state = await extractPreloadedState(await fetchText(BASE_URL + path, { useCache }));
  const pills = findComponents<{ items?: LinkBlock[] }>(state, 'PillNavigationBlockViewModel');
  const items = pills.flatMap((pill) => pill.items ?? []);

  const seen = new Set<string>();
  const links: Array<{ url: string; label: string }> = [];
  for (const item of items) {
    if (!item.url || seen.has(item.url)) continue;
    seen.add(item.url);
    links.push({ url: item.url, label: item.label ?? item.url });
  }
  if (links.length === 0) throw new Error('Pill navigation yielded no campaign links');
  return links;
}
