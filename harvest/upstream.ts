/** Shapes of the Blomsterlandet view models we consume. Partial by design — we read a subset. */

export interface UpstreamSpec {
  name: string;
  value?: string;
  information?: { label?: string; title?: string; body?: string };
}

export interface UpstreamVariant {
  sku?: string;
  code?: string;
  name?: string;
  url?: string;
  price?: { numericalPrice?: number };
  productInformationList?: UpstreamSpec[];
  highlightedTraits?: UpstreamSpec[];
}

export interface UpstreamProduct {
  primaryKey?: string;
  name?: string;
  scientificName?: string;
  description?: string;
  productInformation?: string;
  variants?: UpstreamVariant[];
}

export interface UpstreamCard {
  primaryKey?: string;
  name?: string;
  scientificName?: string;
  url?: string;
  description?: string;
  image?: { baseUrl?: string };
  price?: {
    numericalPrice?: number;
    formattedOriginalPrice?: string;
    promotion?: string;
  };
  gtm?: { id?: string; gtin?: string; category?: string };
}

export interface ProductListResponse {
  products: UpstreamCard[];
  totalMatching: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
  hasMoreProducts: boolean;
  nextApiUrl?: string;
  apiBaseUrl?: string;
}

export interface LinkBlock {
  url?: string;
  label?: string;
  active?: boolean;
}
