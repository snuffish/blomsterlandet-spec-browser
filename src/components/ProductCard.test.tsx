/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { ProductCard } from './ProductCard';
import { mockStock, renderWithQuery, stockJson } from '~/test-setup';
import type { LiveStock, Product, Store } from '~shared/types';

const BRIDGE = 'https://stock-bridge.test/';
const mockProduct: Product = {
  id: 'test-1',
  name: 'Testväxt',
  scientificName: 'Planta testus',
  campaigns: ['perenner'],
  dims: { 'Förväntad sluthöjd': { lo: 50, hi: 60 } },
  tags: {},
  price: { min: 99, max: 99 },
  image: '',
  url: '/produkter/vaxter/testvaxt/',
  variants: [],
  primaryKey: 'test-1',
  description: '',
  taxonomy: [],
  dimsDiffer: [],
};

const mockStores: Store[] = [
  { id: '1', name: 'Arninge', city: 'Täby', region: 'Stockholm', url: 'https://x/1' },
  { id: '2', name: 'Skövde', city: 'Skövde', region: 'Väst', url: 'https://x/2' },
];

const mockStockData = (storesStatus: Array<{ id: string; status: 'inStock' | 'outOfStock' }>): LiveStock => ({
  online: 'outOfStock',
  onlineLabel: 'Online',
  storesHeader: 'Butikslager',
  stores: storesStatus.map(({ id, status }) => ({
    id,
    name: mockStores.find((s) => s.id === id)?.name ?? id,
    city: '',
    region: '',
    url: '',
    status,
    label: status === 'inStock' ? 'I lager' : 'Slut i lager',
  })),
  fetchedAt: '2026-09-23T12:00:00Z',
});

beforeEach(() => vi.stubEnv('VITE_STOCK_API', BRIDGE));
afterEach(() => vi.unstubAllEnvs());

describe('ProductCard stock badge', () => {
  it('renders card basics without stock badge when stock API is disabled', () => {
    vi.stubEnv('VITE_STOCK_API', '');
    const { container } = renderWithQuery(
      <ProductCard product={mockProduct} heightSpec="Förväntad sluthöjd" onOpen={() => { }} />,
    );

    expect(screen.getByText('Testväxt')).toBeTruthy();
    expect(screen.getByText('Planta testus')).toBeTruthy();
    expect(container.querySelector('.card-stock')).toBeNull();
  });

  it('displays store count when stores are available and no store is filtered', async () => {
    mockStock(
      stockJson({
        stock: mockStockData([
          { id: '1', status: 'inStock' },
          { id: '2', status: 'inStock' },
        ]),
      }),
    );

    renderWithQuery(
      <ProductCard
        product={mockProduct}
        heightSpec="Förväntad sluthöjd"
        onOpen={() => { }}
        selectedStores={[]}
        stores={mockStores}
      />,
    );

    expect(await screen.findByText('I butik (2)')).toBeTruthy();
  });

  it('displays store specific stock when a single store is filtered and in stock', async () => {
    mockStock(
      stockJson({
        stock: mockStockData([
          { id: '1', status: 'outOfStock' },
          { id: '2', status: 'inStock' },
        ]),
      }),
    );

    renderWithQuery(
      <ProductCard
        product={mockProduct}
        heightSpec="Förväntad sluthöjd"
        onOpen={() => { }}
        selectedStores={['2']}
        stores={mockStores}
      />,
    );

    expect(await screen.findByText('I lager i Skövde')).toBeTruthy();
  });

  it('displays out-of-stock for chosen store when filtered store has no stock', async () => {
    mockStock(
      stockJson({
        stock: mockStockData([
          { id: '1', status: 'inStock' },
          { id: '2', status: 'outOfStock' },
        ]),
      }),
    );

    renderWithQuery(
      <ProductCard
        product={mockProduct}
        heightSpec="Förväntad sluthöjd"
        onOpen={() => { }}
        selectedStores={['2']}
        stores={mockStores}
      />,
    );

    expect(await screen.findByText('Slut i Skövde')).toBeTruthy();
  });
});
