import { useCallback, useEffect, useState } from 'react';

const KEY = 'blomsterlandet.stores';

/**
 * Which stores the user cares about. A preference rather than a filter step: it never touches
 * the plant grid or the chain, only which shops the Lagerstatus panel reports on. Persisted
 * so the choice survives a reload and applies to every product.
 */
export function useStorePrefs() {
  const [selected, setSelected] = useState<string[]>(() => {
    try {
      const raw = window.localStorage.getItem(KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      // A corrupt or unavailable store is not worth failing the app over.
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(selected));
    } catch {
      // Private browsing and full quotas both land here; the choice simply won't persist.
    }
  }, [selected]);

  const toggle = useCallback((id: string) => {
    setSelected((prev) => (prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id]));
  }, []);

  const clear = useCallback(() => setSelected([]), []);

  return { selected, toggle, clear };
}
