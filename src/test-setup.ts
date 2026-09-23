import { createElement, type ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, vi } from 'vitest';
import { cleanup, render, type RenderResult } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 0,
      },
    },
  });
}

export function renderWithQuery(
  ui: ReactElement,
  client = createTestQueryClient(),
): RenderResult {
  return render(createElement(QueryClientProvider, { client }, ui));
}

afterEach(() => {
  stockResponse = null;
});

afterEach(cleanup);
