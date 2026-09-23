import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = join(HERE, 'cache');

export const BASE_URL = 'https://www.blomsterlandet.se';

/** Identifies the harvester rather than impersonating a browser build we aren't. */
const USER_AGENT =
  'blomsterlandet-spec-browser/1.0 (personal catalogue index; +https://www.blomsterlandet.se/kampanjer/tradgardsrea/)';

/** 5 concurrent requests measured clean across the full catalogue; do not raise casually. */
export const MAX_CONCURRENCY = 5;

const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const cachePath = (url: string) =>
  join(CACHE_DIR, `${createHash('sha1').update(url).digest('hex')}.html`);

export interface FetchOptions {
  useCache?: boolean;
  json?: boolean;
  retries?: number;
}

export async function fetchText(url: string, options: FetchOptions = {}): Promise<string> {
  const { useCache = true, json = false, retries = 4 } = options;
  const path = cachePath(url);

  if (useCache) {
    try {
      return await readFile(path, 'utf8');
    } catch {
      // Cache miss is the normal path on a first run.
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await sleep(Math.min(2 ** attempt * 250, 8000));
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': USER_AGENT,
          Accept: json ? 'application/json' : 'text/html,application/xhtml+xml',
          'Accept-Language': 'sv-SE,sv;q=0.9',
        },
        signal: AbortSignal.timeout(45_000),
      });
      if (RETRY_STATUS.has(response.status)) {
        lastError = new Error(`HTTP ${response.status} for ${url}`);
        continue;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);

      const body = await response.text();
      if (useCache) {
        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(path, body, 'utf8');
      }
      return body;
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`Failed after ${retries + 1} attempts: ${(lastError as Error)?.message}`);
}

export async function fetchJson<T>(url: string, options: FetchOptions = {}): Promise<T> {
  return JSON.parse(await fetchText(url, { ...options, json: true })) as T;
}

/** Bounded-concurrency map that preserves input order and reports progress. */
export async function mapPool<T, R>(
  items: readonly T[],
  worker: (item: T, index: number) => Promise<R>,
  concurrency = MAX_CONCURRENCY,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  let done = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index] as T, index);
      onProgress?.(++done, items.length);
    }
  });

  await Promise.all(runners);
  return results;
}
