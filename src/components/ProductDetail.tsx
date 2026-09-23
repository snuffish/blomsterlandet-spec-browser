import { useEffect, useRef } from 'react';
import type { Product } from '~shared/types';
import { formatRange } from '~shared/units';
import { formatPrice, thumbnail } from '~/lib/format';

const SITE = 'https://www.blomsterlandet.se';

interface Props {
  product: Product;
  onClose: () => void;
}

export function ProductDetail({ product, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Specs are identical across variants for most products; show the first variant's list and
  // flag only the keys that genuinely disagree.
  const specs = product.variants[0]?.specs ?? {};

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div
        className="detail" ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true"
        aria-label={product.name} onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="close" onClick={onClose} aria-label="Stäng">✕</button>

        <div className="detail-head">
          {product.image && (
            <img src={thumbnail(product.image, 480)} alt={product.name} className="detail-image" />
          )}
          <div>
            <h2>{product.name}</h2>
            <p className="scientific">{product.scientificName}</p>
            {product.taxonomy.length > 0 && <p className="taxonomy">{product.taxonomy.join(' › ')}</p>}
            {product.description && <p className="description">{product.description}</p>}
            <a className="external" href={SITE + product.url} target="_blank" rel="noopener noreferrer">
              Visa på blomsterlandet.se ↗
            </a>
          </div>
        </div>

        {Object.keys(product.dims).length > 0 && (
          <section>
            <h3>Mått</h3>
            <dl className="specs">
              {Object.entries(product.dims).map(([name, range]) => (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd>
                    {formatRange(range, name === 'Odlingszon' ? 'zone' : 'cm')}
                    {product.dimsDiffer.includes(name) && (
                      <span className="hint" title="Varianterna anger olika värden — intervallet är sammanslaget">
                        varierar mellan varianter
                      </span>
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section>
          <h3>Varianter ({product.variants.length})</h3>
          <table className="variants">
            <thead>
              <tr><th>Variant</th><th>Krukstorlek</th><th>Pris</th><th>Artikelnr</th></tr>
            </thead>
            <tbody>
              {product.variants.map((variant) => (
                <tr key={variant.sku}>
                  <td>{variant.name || '—'}</td>
                  <td>
                    {variant.potSizeLitre
                      ? formatRange(variant.potSizeLitre, 'litre')
                      : variant.potSizeCm
                        ? formatRange(variant.potSizeCm, 'cm')
                        : (variant.specs['Krukstorlek'] ?? '—')}
                  </td>
                  <td>{variant.price ? formatPrice(variant.price) : '—'}</td>
                  <td className="sku">{variant.sku}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h3>Egenskaper</h3>
          <dl className="specs">
            {Object.entries(specs)
              .filter(([name]) => !(name in product.dims) && name !== 'Krukstorlek')
              .map(([name, value]) => (
                <div key={name}><dt>{name}</dt><dd>{value}</dd></div>
              ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
