import type { Product } from '../shared/types';

/**
 * Thresholds sit below values measured during the investigation, so ordinary catalogue drift
 * passes while a structural break (schema change, blocked requests, a dead campaign) fails
 * the build instead of writing a half-parsed dataset that looks plausible.
 */
const MIN_PRODUCTS = 1_500; // measured 1,740
const EXPECTED_CAMPAIGNS = 8;
const MIN_HEIGHT_COVERAGE = 0.9; // measured 0.99
const MAX_FETCH_FAILURE_RATE = 0.01; // measured 0

export const PRIMARY_DIMENSION = 'Förväntad sluthöjd';

export interface ValidationInput {
  products: Product[];
  campaignCount: number;
  emptyCampaigns: string[];
  fetchFailures: number;
  attempted: number;
}

export class ValidationError extends Error {}

export function validate(input: ValidationInput): Record<string, number> {
  const { products, campaignCount, emptyCampaigns, fetchFailures, attempted } = input;
  const failures: string[] = [];

  if (products.length < MIN_PRODUCTS) {
    failures.push(`Only ${products.length} products (expected ≥ ${MIN_PRODUCTS})`);
  }
  if (campaignCount !== EXPECTED_CAMPAIGNS) {
    failures.push(`Discovered ${campaignCount} campaigns (expected ${EXPECTED_CAMPAIGNS})`);
  }
  if (emptyCampaigns.length > 0) {
    failures.push(`Campaigns yielded no products: ${emptyCampaigns.join(', ')}`);
  }

  const failureRate = attempted > 0 ? fetchFailures / attempted : 0;
  if (failureRate > MAX_FETCH_FAILURE_RATE) {
    failures.push(`${(failureRate * 100).toFixed(1)}% of detail pages failed to fetch`);
  }

  const withHeight = products.filter((p) => PRIMARY_DIMENSION in p.dims).length;
  const coverage = products.length > 0 ? withHeight / products.length : 0;
  if (coverage < MIN_HEIGHT_COVERAGE) {
    failures.push(
      `"${PRIMARY_DIMENSION}" covers ${(coverage * 100).toFixed(1)}% of products ` +
        `(expected ≥ ${MIN_HEIGHT_COVERAGE * 100}%)`,
    );
  }

  if (failures.length > 0) {
    throw new ValidationError(`Harvest validation failed:\n  - ${failures.join('\n  - ')}`);
  }

  const dimCoverage: Record<string, number> = {};
  const dimNames = new Set(products.flatMap((p) => Object.keys(p.dims)));
  for (const name of dimNames) {
    dimCoverage[name] = products.filter((p) => name in p.dims).length / products.length;
  }
  return dimCoverage;
}
