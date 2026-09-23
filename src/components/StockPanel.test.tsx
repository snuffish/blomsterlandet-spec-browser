/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { StockPanel } from './StockPanel';
import { mockStock, stockJson } from '~/test-setup';
import type { LiveStock } from '~shared/types';

const BRIDGE = 'https://stock-bridge.test/';
const URL_PATH = '/produkter/vaxter/nagon-vaxt-1/';

const stock = (overrides: Partial<LiveStock> = {}): LiveStock => ({
  online: 'inStock',
  onlineLabel: 'Online',
  storesHeader: 'Butikslager',
  stores: [
    { id: '1', name: 'Arninge', city: 'Täby', region: 'Stockholm', url: 'https://x/1', status: 'inStock', label: 'I lager' },
    { id: '2', name: 'Skövde', city: 'Skövde', region: 'Väst', url: 'https://x/2', status: 'onlyOnline', label: 'Säljs endast online' },
  ],
  fetchedAt: '2026-09-23T10:00:00.000Z',
  ...overrides,
});

beforeEach(() => vi.stubEnv('VITE_STOCK_API', BRIDGE));
afterEach(() => vi.unstubAllEnvs());

describe('StockPanel', () => {
  it('renders online status and the store breakdown once loaded', async () => {
    mockStock(stockJson({ stock: stock() }));
    const { container } = render(<StockPanel productUrl={URL_PATH} />);

    // "I lager" appears both as the online status and as a store label, so scope the
    // online assertion to its own row rather than searching the whole panel.
    await screen.findByText('Arninge');
    const online = container.querySelector('.stock-online');
    expect(online?.textContent).toContain('Online');
    expect(online?.textContent).toContain('I lager');

    expect(screen.getByText('Butikslager')).toBeTruthy();
    expect(screen.getByText('Säljs endast online')).toBeTruthy();
  });

  it('groups stores by region', async () => {
    mockStock(stockJson({ stock: stock() }));
    render(<StockPanel productUrl={URL_PATH} />);

    await screen.findByText('Arninge');
    expect(screen.getByText('Stockholm')).toBeTruthy();
    expect(screen.getByText('Väst')).toBeTruthy();
  });

  it('shows a pending state while the request is in flight', () => {
    mockStock(stockJson({ stock: stock() }));
    render(<StockPanel productUrl={URL_PATH} />);

    expect(screen.getByText(/Hämtar lagerstatus/)).toBeTruthy();
  });

  /** Upstream genuinely has no inventory block for some products — distinct from a failure. */
  it('says status is missing when the bridge returns no stock', async () => {
    mockStock(stockJson({ stock: null }));
    render(<StockPanel productUrl={URL_PATH} />);

    expect(await screen.findByText(/Lagerstatus saknas/)).toBeTruthy();
  });

  it('renders an error when the bridge fails', async () => {
    mockStock(stockJson({ error: 'Butiken svarade 503.' }, 502));
    render(<StockPanel productUrl={URL_PATH} />);

    expect(await screen.findByText(/Kunde inte hämta lagerstatus/)).toBeTruthy();
  });

  /** A status we don't recognise must still render its label rather than vanish. */
  it('renders an unknown upstream status instead of dropping the store', async () => {
    mockStock(
      stockJson({
        stock: stock({
          stores: [{ id: '3', name: 'Nyköping', city: 'Nyköping', region: 'Öst', url: 'https://x/3', status: 'comingSoon' as never, label: 'Kommer snart' }],
        }),
      }),
    );
    render(<StockPanel productUrl={URL_PATH} />);

    expect(await screen.findByText('Nyköping')).toBeTruthy();
    expect(screen.getByText('Kommer snart')).toBeTruthy();
  });

  it('renders nothing at all when no bridge is configured', () => {
    vi.stubEnv('VITE_STOCK_API', '');
    const { container } = render(<StockPanel productUrl={URL_PATH} />);

    expect(container.querySelector('.stock')).toBeNull();
  });

  it('does not fetch when no product is selected', async () => {
    render(<StockPanel productUrl={null} />);
    // mockStock was never armed; a stray fetch would throw inside the stub.
    await waitFor(() => expect(screen.queryByText(/Kunde inte/)).toBeNull());
  });
});
