import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RangeMode } from '~/lib/query';
import { nextStepId, type Step, type StepInput } from '~/lib/chain';
import { decodeChain, encodeChain } from '~/lib/chain-url';

/** A filter step is replaced in place when re-edited, so the sidebar never stacks duplicates. */
const sameTarget = (a: Step, b: Step): boolean => {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'dim' && b.kind === 'dim') return a.name === b.name;
  if (a.kind === 'tag' && b.kind === 'tag') return a.name === b.name;
  return a.kind === 'search' || a.kind === 'campaign' || a.kind === 'price';
};

export function useChain() {
  const [steps, setSteps] = useState<Step[]>(() => decodeChain(window.location.search));

  useEffect(() => {
    const query = encodeChain(steps);
    const url = query ? `${window.location.pathname}?k=${query}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [steps]);

  /** Upsert a filter step: replaces an existing one for the same target, else appends. */
  const upsert = useCallback((step: StepInput) => {
    setSteps((prev) => {
      const candidate = { ...step, id: nextStepId(), enabled: true } as Step;
      const index = prev.findIndex((s) => sameTarget(s, candidate));
      if (index === -1) return [...prev, candidate];
      const next = [...prev];
      next[index] = { ...candidate, id: prev[index]!.id, enabled: prev[index]!.enabled };
      return next;
    });
  }, []);

  const append = useCallback((step: StepInput) => {
    setSteps((prev) => [...prev, { ...step, id: nextStepId(), enabled: true } as Step]);
  }, []);

  const removeKind = useCallback((predicate: (step: Step) => boolean) => {
    setSteps((prev) => prev.filter((s) => !predicate(s)));
  }, []);

  const remove = useCallback((id: string) => {
    setSteps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  const toggle = useCallback((id: string) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)));
  }, []);

  const move = useCallback((id: string, delta: number) => {
    setSteps((prev) => {
      const index = prev.findIndex((s) => s.id === id);
      const target = index + delta;
      if (index === -1 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  const update = useCallback((id: string, patch: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? ({ ...s, ...patch } as Step) : s)));
  }, []);

  const reset = useCallback(() => setSteps([]), []);

  // Convenience wrappers the sidebar uses, so it never builds step objects itself.
  const api = useMemo(
    () => ({
      setSearch: (value: string) =>
        value.trim() ? upsert({ kind: 'search', value }) : removeKind((s) => s.kind === 'search'),
      setDim: (name: string, range: { lo: number; hi: number; mode: RangeMode } | null) =>
        range
          ? upsert({ kind: 'dim', name, ...range })
          : removeKind((s) => s.kind === 'dim' && s.name === name),
      setTag: (name: string, values: string[]) =>
        values.length
          ? upsert({ kind: 'tag', name, values })
          : removeKind((s) => s.kind === 'tag' && s.name === name),
      setCampaigns: (values: string[]) =>
        values.length
          ? upsert({ kind: 'campaign', values })
          : removeKind((s) => s.kind === 'campaign'),
    }),
    [upsert, removeKind],
  );

  return { steps, setSteps, append, remove, toggle, move, update, reset, ...api };
}
