import type { Product } from '~shared/types';
import { formatRange } from '~shared/units';
import { formatPriceSpan, thumbnail } from '~/lib/format';

interface Props {
  product: Product;
  heightSpec: string;
  onOpen: (product: Product) => void;
}

export function ProductCard({ product, heightSpec, onOpen }: Props) {
  const height = product.dims[heightSpec];

  return (
    <article className="card">
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
        </div>
      </button>
    </article>
  );
}
