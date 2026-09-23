import { extractLiveStock } from '../../shared/stock';

/**
 * CORS bridge for live stock.
 *
 * Blomsterlandet serves no `access-control-*` headers, and the site is a static GitHub Pages
 * deploy with no server of its own, so a browser cannot read product pages directly. This
 * Worker is the smallest thing that closes that gap.
 *
 * It parses rather than relays: a product page is ~465 KB of HTML, the stock block inside it
 * is ~12 KB, so extracting here instead of in the browser cuts the visitor's payload ~38x.
 */

/** Only product pages on the one origin we actually need. Keeps this from being an open relay. */
const ALLOWED_ORIGIN = 'https://www.blomsterlandet.se';
const ALLOWED_PATH = '/produkter/';

/** The deployed site. Never '*' — this Worker exists for one caller in production. */
const SITE_ORIGIN = 'https://snuffish.github.io';

/**
 * Any loopback port is also accepted, because Vite hops to the next free port (5174, 5175…)
 * whenever 5173 is taken and pinning an exact dev port breaks the moment two servers run.
 * Widening this costs nothing: the Worker exposes only public product pages, holds no
 * credentials and mutates nothing, and a page can only claim a loopback origin if it is
 * genuinely served from the developer's own machine.
 */
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/;

export const isAllowedCaller = (origin: string): boolean =>
  origin === SITE_ORIGIN || LOOPBACK.test(origin);

/** Matches harvest/http.ts — identifies the caller rather than impersonating a browser. */
const USER_AGENT =
  'blomsterlandet-spec-browser/1.0 (personal catalogue index; +https://github.com/snuffish/blomsterlandet-spec-browser)';

const UPSTREAM_TIMEOUT_MS = 15_000;

function corsHeaders(origin: string | null): Record<string, string> {
  // An unrecognised origin gets the production origin back: it won't match, so the browser
  // blocks the read — which is the intended answer, not an error.
  const allowed = origin && isAllowedCaller(origin) ? origin : SITE_ORIGIN;
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, OPTIONS',
    vary: 'Origin',
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

const CACHE_TTL_SECONDS = 900; // 15 minutes
const STALE_WHILE_REVALIDATE_SECONDS = 300; // 5 minutes

function json(
  body: unknown,
  status: number,
  origin: string | null,
  cacheControl = 'no-store',
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
      ...corsHeaders(origin),
    },
  });
}

/** Rejects anything that is not a Blomsterlandet product page. */
function validateTarget(raw: string | null): URL | null {
  if (!raw) return null;
  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return null;
  }
  if (target.origin !== ALLOWED_ORIGIN) return null;
  if (!target.pathname.startsWith(ALLOWED_PATH)) return null;
  return target;
}

export default {
  async fetch(request: Request, _env?: unknown, ctx?: ExecutionContext): Promise<Response> {
    const origin = request.headers.get('Origin');

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== 'GET') {
      return json({ error: `${request.method} stöds inte.` }, 405, origin);
    }

    const target = validateTarget(new URL(request.url).searchParams.get('url'));
    if (!target) {
      return json(
        { error: `\`url\` måste vara en produktsida på ${ALLOWED_ORIGIN}${ALLOWED_PATH}` },
        400,
        origin,
      );
    }

    // Cloudflare Edge Cache: check if the parsed stock is already cached.
    const cacheKey = new Request(target.toString(), { method: 'GET' });
    const cache =
      typeof caches !== 'undefined' && 'default' in caches ? (caches as unknown as { default: Cache }).default : null;

    if (cache) {
      try {
        const cached = await cache.match(cacheKey);
        if (cached) {
          const headers = new Headers(cached.headers);
          for (const [k, v] of Object.entries(corsHeaders(origin))) {
            headers.set(k, v);
          }
          return new Response(cached.body, {
            status: cached.status,
            headers,
          });
        }
      } catch {
        // Fall through on cache error to avoid failing the request.
      }
    }

    let upstream: Response;
    try {
      upstream = await fetch(target.toString(), {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Language': 'sv-SE,sv;q=0.9',
        },
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      });
    } catch (error) {
      return json({ error: `Kunde inte nå butiken: ${(error as Error).message}` }, 502, origin);
    }

    if (!upstream.ok) {
      return json({ error: `Butiken svarade ${upstream.status}.` }, 502, origin);
    }

    try {
      const stock = extractLiveStock(await upstream.text());
      const cacheControl = `public, max-age=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_WHILE_REVALIDATE_SECONDS}`;
      const response = json({ stock }, 200, origin, cacheControl);

      if (cache) {
        const toCache = response.clone();
        if (ctx && typeof ctx.waitUntil === 'function') {
          ctx.waitUntil(cache.put(cacheKey, toCache));
        } else {
          cache.put(cacheKey, toCache).catch(() => {});
        }
      }

      return response;
    } catch (error) {
      return json({ error: `Kunde inte tolka produktsidan: ${(error as Error).message}` }, 502, origin);
    }
  },
};
