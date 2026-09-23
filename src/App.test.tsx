/**
 * @vitest-environment jsdom
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import type { HarvestMeta } from '~shared/types';

/** Read from the dataset rather than hard-coded, so a re-harvest doesn't break the suite. */
const TOTAL: number = (
  JSON.parse(readFileSync(join(process.cwd(), 'public', 'data', 'meta.json'), 'utf8')) as HarvestMeta
).productCount;

/** Chain state lives in the URL, so each case must start from a clean one. */
beforeEach(() => {
  window.history.replaceState(null, '', '/');
});

const mountApp = async () => {
  render(<App />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 })).toBeDefined(), {
    timeout: 15_000,
  });
};

const resultCount = (): number =>
  Number((document.querySelector('.count strong')?.textContent ?? '0').replace(/\D/g, ''));

const chainRows = (): HTMLElement[] =>
  [...document.querySelectorAll('.chain-step:not(.start)')] as HTMLElement[];

const chainCounts = (): number[] =>
  chainRows().map((row) =>
    Number((row.querySelector('.chain-count')?.firstChild?.textContent ?? '').replace(/\D/g, '')),
  );

const setHeight = (lo: string, hi: string): void => {
  for (const [label, value] of [['från', lo], ['till', hi]] as const) {
    const input = screen.getByLabelText(`Förväntad sluthöjd – ${label}`);
    fireEvent.change(input, { target: { value } });
    fireEvent.blur(input);
  }
};

const addSort = async (field: string): Promise<void> => {
  fireEvent.click(screen.getByRole('button', { name: '+ Lägg till steg' }));
  const select = await screen.findByLabelText('Sortera efter');
  fireEvent.change(select, { target: { value: field } });
};

describe('App — end to end against the harvested catalogue', () => {
  it('renders the full catalogue on first load', async () => {
    await mountApp();
    expect(resultCount()).toBe(TOTAL);
    expect(chainRows()).toHaveLength(0);
  });

  it('THE ACCEPTANCE CASE: filtering to 50–60 cm surfaces Afghanperovskia', async () => {
    await mountApp();
    setHeight('50', '60');

    await waitFor(() => expect(resultCount()).toBe(532));

    fireEvent.change(screen.getByPlaceholderText('Sök på namn…'), {
      target: { value: 'Afghanperovskia' },
    });
    await waitFor(() => {
      const grid = document.querySelector('.grid') as HTMLElement;
      expect(within(grid).getByRole('heading', { name: /Little Spire/ })).toBeDefined();
    });
  });

  it('THE CHAIN: small plants, then cheapest first', async () => {
    await mountApp();
    setHeight('1', '40');
    await waitFor(() => expect(resultCount()).toBeLessThan(TOTAL));

    await addSort('price');
    await waitFor(() => expect(chainRows()).toHaveLength(2));

    // Prices ascend across the rendered grid.
    const prices = [...document.querySelectorAll('.card .price strong')]
      .slice(0, 12)
      .map((el) => Number((el.textContent ?? '').replace(/[^\d,]/g, '').replace(',', '.')));
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });

  it('shows the funnel: each step reports what it removed', async () => {
    await mountApp();
    setHeight('1', '40');
    await waitFor(() => expect(chainRows()).toHaveLength(1));

    const counts = chainCounts();
    expect(counts[0]).toBe(resultCount());
    expect(counts[0]).toBeLessThan(TOTAL);
    expect(document.querySelector('.chain-count .removed')?.textContent).toMatch(/−/);
  });

  it('labels stacked sorts as primary and tie-breaker', async () => {
    await mountApp();
    await addSort('price');
    await addSort('name');

    await waitFor(() => expect(chainRows()).toHaveLength(2));
    const tiers = [...document.querySelectorAll('.tier')].map((el) => el.textContent);
    expect(tiers[0]).toContain('primär');
    expect(tiers[1]).toContain('bryter lika');
  });

  it('reordering a step changes the result — the chain is ordered', async () => {
    await mountApp();
    await addSort('price');
    await waitFor(() => expect(chainRows()).toHaveLength(1));

    fireEvent.click(screen.getByRole('button', { name: '+ Lägg till steg' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Behåll de 20 första' }));
    await waitFor(() => expect(resultCount()).toBe(20));

    const cheapestFirst = document.querySelector('.card h3')?.textContent;

    // Move the limit above the sort: now it keeps the first 20 unsorted, then sorts those.
    const limitRow = chainRows()[1] as HTMLElement;
    fireEvent.click(within(limitRow).getByRole('button', { name: 'Flytta upp' }));

    await waitFor(() => {
      expect(document.querySelector('.card h3')?.textContent).not.toBe(cheapestFirst);
    });
    expect(resultCount()).toBe(20);
  });

  it('disabling a step restores the wider result set without losing it', async () => {
    await mountApp();
    setHeight('1', '40');
    await waitFor(() => expect(resultCount()).toBeLessThan(TOTAL));

    fireEvent.click(screen.getByRole('button', { name: 'Inaktivera steg' }));
    await waitFor(() => expect(resultCount()).toBe(TOTAL));
    expect(chainRows()).toHaveLength(1); // the step is still there, just off
  });

  it('persists the whole chain to the URL so a view is shareable', async () => {
    await mountApp();
    setHeight('50', '60');
    await addSort('price');

    await waitFor(() => {
      expect(window.location.search).toContain('k=');
      expect(decodeURIComponent(window.location.search)).toContain('50~60');
      expect(decodeURIComponent(window.location.search)).toContain('s~price');
    });
  });

  it('opens a detail panel listing every variant with its own price', async () => {
    await mountApp();
    fireEvent.change(screen.getByPlaceholderText('Sök på namn…'), {
      target: { value: 'Afghanperovskia' },
    });

    await waitFor(() => expect(document.querySelectorAll('.card').length).toBeGreaterThan(0));
    fireEvent.click(document.querySelector('.card-body') as HTMLElement);

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Varianter \(2\)/)).toBeDefined();
    expect(within(dialog).getAllByText(/64,5 kr|164,5 kr/).length).toBeGreaterThan(0);
  });

  it('shows the harvest date and the campaign expiry notice', async () => {
    await mountApp();
    expect(screen.getByText(/Data hämtad/)).toBeDefined();
    expect(screen.getByText(/t\.o\.m 11\/10/)).toBeDefined();
  });
});
