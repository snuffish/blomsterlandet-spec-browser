import { useMemo } from 'react';
import type { FacetCatalogue, Product, Store } from '~shared/types';
import type { BaseUnit } from '~shared/units';
import { campaignCounts, facetCounts, type DimFilter, type FilterState } from '~/lib/query';
import { ChipFilter } from './ChipFilter';
import { RangeFilter } from './RangeFilter';
import { StoreFilter } from './StoreFilter';

export const PRIMARY_DIM = 'Förväntad sluthöjd';

/** Order the facets the way someone shopping for plants actually thinks about them. */
const FACET_ORDER = [
  'Läge', 'Blomfärg', 'Blomningstid', 'Växtsätt', 'Utmärkande egenskaper',
  'Bladfärg', 'Certifiering', 'Kvalitet - typ av planta', 'Fruktfärg', 'Fruktsmak',
];

interface Props {
  products: Product[];
  facets: FacetCatalogue;
  filters: FilterState;
  setSearch: (value: string) => void;
  setDim: (name: string, value: DimFilter | null) => void;
  setTag: (name: string, values: string[]) => void;
  setCampaigns: (values: string[]) => void;
  onReset: () => void;
  stores: Store[];
  selectedStores: string[];
  onToggleStore: (id: string) => void;
  onClearStores: () => void;
}

export function FilterPanel({
  products, facets, filters, setSearch, setDim, setTag, setCampaigns, onReset,
  stores, selectedStores, onToggleStore, onClearStores,
}: Props) {
  const toggleTag = (name: string, value: string): void => {
    const current = filters.tags[name] ?? [];
    setTag(name, current.includes(value) ? current.filter((v) => v !== value) : [...current, value]);
  };

  const toggleCampaign = (slug: string): void => {
    const current = filters.campaigns;
    setCampaigns(current.includes(slug) ? current.filter((c) => c !== slug) : [...current, slug]);
  };
  const dimNames = useMemo(
    () => Object.keys(facets.dims).sort((a, b) => (a === PRIMARY_DIM ? -1 : b === PRIMARY_DIM ? 1 : (facets.dims[b]?.count ?? 0) - (facets.dims[a]?.count ?? 0))),
    [facets.dims],
  );

  const tagNames = useMemo(() => {
    const known = FACET_ORDER.filter((name) => facets.tags[name]);
    const rest = Object.keys(facets.tags).filter((name) => !FACET_ORDER.includes(name));
    return [...known, ...rest];
  }, [facets.tags]);

  // Every chip count is live against the rest of the chain, so the badges say how many
  // results the click would actually yield. One relaxed pass per facet — memoized, because
  // it walks the whole catalogue and the sidebar re-renders on every keystroke.
  const campaigns = useMemo(() => {
    const counts = campaignCounts(products, filters);
    return facets.campaigns.map(({ value, label }) => ({
      value, label, count: counts.get(value) ?? 0,
    }));
  }, [products, facets.campaigns, filters]);

  const tagGroups = useMemo(
    () =>
      tagNames.map((name) => {
        const counts = facetCounts(products, filters, name);
        const selected = filters.tags[name] ?? [];
        return {
          name,
          selected,
          values: (facets.tags[name] ?? [])
            .map(({ value }) => ({ value, count: counts.get(value) ?? 0 }))
            .filter((v) => v.count > 0 || selected.includes(v.value)),
        };
      }),
    [products, facets.tags, filters, tagNames],
  );

  return (
    <aside className="filters">
      <div className="filters-rail">
        <div className="filters-head">
          <h2>Filter</h2>
          <button type="button" className="link" onClick={onReset}>Rensa alla</button>
        </div>

        <label className="search">
          <span className="sr-only">Sök växt</span>
          <input
            type="search" placeholder="Sök på namn…" value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>

        <ChipFilter
          label="Kategori" values={campaigns} selected={filters.campaigns}
          onToggle={toggleCampaign}
        />

        {dimNames.map((name) => {
          const dim = facets.dims[name];
          if (!dim) return null;
          const unit: BaseUnit = name === 'Odlingszon' ? 'zone' : 'cm';
          return (
            <RangeFilter
              key={name} label={name} min={Math.floor(dim.min)} max={Math.ceil(dim.max)}
              unit={unit} value={filters.dims[name] ?? null}
              onChange={(value) => setDim(name, value)}
            />
          );
        })}

        {tagGroups.map(({ name, values, selected }) => (
          <ChipFilter
            key={name} label={name} values={values} selected={selected}
            onToggle={(value) => toggleTag(name, value)}
          />
        ))}

        <StoreFilter
          stores={stores} selected={selectedStores}
          onToggle={onToggleStore} onClear={onClearStores}
        />
      </div>
    </aside>
  );
}
