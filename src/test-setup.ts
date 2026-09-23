import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

/**
 * Serve the real harvested dataset to the app under test. Mounting against fixtures would
 * verify the wiring but not that the actual catalogue renders and filters correctly.
 */
const DATA_DIR = join(process.cwd(), 'public', 'data');

vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
  const path = String(input).replace(/^\.?\/?/, '');
  const body = readFileSync(join(DATA_DIR, path.replace(/^data\//, '')), 'utf8');
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
});

afterEach(cleanup);
