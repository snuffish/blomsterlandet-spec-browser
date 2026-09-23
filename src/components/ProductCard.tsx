import { useEffect, useRef, useState } from 'react';
import type { LiveStock, Product, Store } from '~shared/types';
import { formatRange } from '~shared/units';
import { formatPriceSpan, thumbnail } from '~/lib/format';
import { useCardStock } from '~/hooks/useCardStock';
import { stockEnabled } from '~/lib/stock';

interface Props {
  product: Product;
  heightSpec: string;
  onOpen: (product: Product) => void;
  selectedStores?: string[];
  stores?: Store[];
}

const IN_STOCK = new Set(['inStock', 'limitedStock']);

function stockBadge(
  stock: LiveStock | null,
  selectedStores: string[],
  stores: Store[],
): { label: string; status: 'in-stock' | 'out-of-stock' } | null {
  if (!stock) return null;

  if (selectedStores.length > 0) {
    const matching = stock.stores.filter(
      (s) => selectedStores.includes(s.id) && IN_STOCK.has(s.status),
    );
    if (matching.length > 0) {
      if (selectedStores.length === 1) {
        const storeName = stores.find((s) => s.id === selectedStores[0])?.name ?? 'Vald butik';
        return { label: `I lager i ${storeName}`, status: 'in-stock' };
      }
      return { label: `I lager (${matching.length} butiker)`, status: 'in-stock' };
    }
    if (selectedStores.length === 1) {
      const storeName = stores.find((s) => s.id === selectedStores[0])?.name ?? 'Vald butik';
      return { label: `Slut i ${storeName}`, status: 'out-of-stock' };
    }
    return { label: 'Slut i valda butiker', status: 'out-of-stock' };
  }

  const inStockStores = stock.stores.filter((s) => IN_STOCK.has(s.status)).length;
  if (inStockStores > 0) {
    return { label: `I butik (${inStockStores})`, status: 'in-stock' };
  }
  if (IN_STOCK.has(stock.online)) {
    return { label: 'Endast online', status: 'in-stock' };
  }
  return { label: 'Slut i lager', status: 'out-of-stock' };
}

export function ProductCard({
  product,
  heightSpec,
  onOpen,
  selectedStores = [],
  stores = [],
}: Props) {
  const height = product.dims[heightSpec];
  const cardRef = useRef<HTMLElement>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!cardRef.current) return;
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, []);

  const enabled = stockEnabled();
  const { stock, loading } = useCardStock(product.url, isVisible);
  const badge = stockBadge(stock, selectedStores, stores);

  return (
    <article className="card" ref={cardRef}>
      <button type="button" className="card-body" onClick={() => onOpen(product)}>
        <div className="card-image">
          {product.image ? (
            <img src={thumbnail(product.image)} alt={product.name} loading="lazy" decoding="async" />
          ) : (
            <div className="card-image-empty" aria-hidden="true">🌿</div>
          )}
          {product.price.original && <span className="badge">REA</span>}
        </div>

        <div className="card-text">
          <h3>{product.name}</h3>
          <p className="scientific">{product.scientificName}</p>

          {height && (
            <p className="height">
              <span className="height-label">Sluthöjd</span>
              <strong>{formatRange(height, 'cm')}</strong>
            </p>
          )}

          <p className="price">
            <strong>{formatPriceSpan(product.price.min, product.price.max)}</strong>
            {product.price.original && <s>{product.price.original}</s>}
          </p>

          {enabled && (
            <div className="card-stock" aria-live="polite">
              {badge ? (
                <>
                  <span className={`card-stock-dot ${badge.status}`} aria-hidden="true" />
                  <span className={`card-stock-text ${badge.status}`}>{badge.label}</span>
                </>
              ) : loading ? (
                <span className="card-stock-loading" aria-hidden="true">Hämtar lager…</span>
              ) : null}
            </div>
          )}
        </div>
      </button>
    </article>
  );
}
