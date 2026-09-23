import { useMemo } from 'react';
import type { Store } from '~shared/types';
import { FilterSection } from './FilterSection';

interface Props {
  stores: Store[];
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

/**
 * Picks which shops the Lagerstatus panel reports on.
 *
 * Deliberately NOT a chain step: live stock never enters `runChain`, so this narrows what the
 * detail panel shows and leaves the plant grid untouched. With nothing picked the panel falls
 * back to listing every store that has the product in stock.
 */
export function StoreFilter({ stores, selected, onToggle, onClear }: Props) {
  const byRegion = useMemo(() => {
    const groups = new Map<string, Store[]>();
    for (const store of stores) {
      const key = store.region || 'Övriga';
      groups.set(key, [...(groups.get(key) ?? []), store]);
    }
    return [...groups].sort(([a], [b]) => a.localeCompare(b, 'sv'));
  }, [stores]);

  const summary = useMemo(() => {
    const names = stores.filter((s) => selected.includes(s.id)).map((s) => s.name);
    return names.length <= 2 ? names.join(', ') : `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }, [stores, selected]);

  if (stores.length === 0) return null;

  return (
    <FilterSection
      label="Butiker"
      className="store-filter"
      defaultOpen={false}
      activeCount={selected.length}
      activeSummary={summary}
      onClear={selected.length > 0 ? onClear : undefined}
      clearLabel="Rensa valda butiker"
    >
      <p className="store-hint">
        {selected.length === 0
          ? 'Inga valda — lagerstatus visar alla butiker som har varan.'
          : 'Lagerstatus visar endast dessa butiker när varan finns i lager.'}
      </p>

      {byRegion.map(([region, group]) => (
        <div key={region} className="store-group">
          <h4>{region}</h4>
          <ul>
            {group.map((store) => (
              <li key={store.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected.includes(store.id)}
                    onChange={() => onToggle(store.id)}
                  />
                  <span>{store.name}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </FilterSection>
  );
}
