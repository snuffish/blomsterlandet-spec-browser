import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Serve the real harvested dataset to the app under test. Mounting against fixtures would
 * verify the wiring but not that the actual catalogue renders and filters correctly.
 */
const DATA_DIR = join(process.cwd(), 'public', 'data');

/**
 * Live-stock responses a test can queue up. The stock bridge is a different origin from the
 * dataset, so it gets its own branch rather than being forced through the file loader below.
 */
let stockResponse: (() => Response) | null = null;

export const mockStock = (respond: () => Response): void => {
  stockResponse = respond;
};

export const stockJson = (body: unknown, status = 200): (() => Response) =>
  () => new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
  const url = String(input);

  if (url.includes('stock-bridge.test')) {
    if (!stockResponse) throw new Error('Unexpected stock fetch — call mockStock() first.');
    return stockResponse();
  }

  const path = url.replace(/^\.?\/?/, '');
  const body = readFileSync(join(DATA_DIR, path.replace(/^data\//, '')), 'utf8');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
});

afterEach(() => {
  stockResponse = null;
});

afterEach(cleanup);
