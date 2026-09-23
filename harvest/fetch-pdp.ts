import { extractPreloadedState } from '~shared/extract-state';
import { BASE_URL, fetchText } from './http';
import type { UpstreamProduct } from './upstream';

interface PdpState {
  pageContent?: { product?: UpstreamProduct };
}

/** Pull one product's view model out of its detail page. */
export async function fetchProductDetail(
  url: string,
  useCache: boolean,
): Promise<UpstreamProduct | null> {
  const state = extractPreloadedState<PdpState>(await fetchText(BASE_URL + url, { useCache }));
  return state.pageContent?.product ?? null;
}
