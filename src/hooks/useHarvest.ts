import { useCallback, useEffect, useRef, useState } from 'react';

export interface HarvestState {
  running: boolean;
  log: string[];
  ok?: boolean;
  error?: string;
}

const ENDPOINT = '/__harvest';
const POLL_MS = 1500;

/**
 * Drives the dev server's harvest endpoint. The scrape takes minutes, so the run lives on the
 * server and this only polls it — a reload mid-harvest picks the same run back up.
 */
export function useHarvest(onComplete: () => void) {
  const [state, setState] = useState<HarvestState | null>(null);
  const complete = useRef(onComplete);
  complete.current = onComplete;

  const start = useCallback(async (): Promise<void> => {
    setState({ running: true, log: ['Startar om skörden…'] });
    try {
      const response = await fetch(ENDPOINT, { method: 'POST' });
      const body = (await response.json()) as HarvestState;
      setState(response.ok ? { ...body, running: true } : { ...body, running: false });
    } catch (error) {
      setState({ running: false, log: [], error: (error as Error).message });
    }
  }, []);

  useEffect(() => {
    if (!state?.running) return;
    let cancelled = false;
    const timer = setInterval(() => {
      void fetch(ENDPOINT)
        .then((response) => response.json() as Promise<HarvestState>)
        .then((next) => {
          if (cancelled) return;
          setState(next);
          if (!next.running && next.ok) complete.current();
        })
        // The dev server restarts itself when the harvest touches watched files; keep polling.
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [state?.running]);

  return { state, start };
}
