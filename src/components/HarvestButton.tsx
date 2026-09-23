import { useHarvest } from '~/hooks/useHarvest';

const TAIL = 8;

interface Props {
  /** Called once a run finishes cleanly, so the caller can pull the new dataset in. */
  onComplete: () => void;
}

export function HarvestButton({ onComplete }: Props) {
  const { state, start } = useHarvest(onComplete);
  const running = state?.running ?? false;
  const failed = state?.error !== undefined || state?.ok === false;

  return (
    <div className="harvest">
      <button type="button" className="harvest-run" onClick={() => void start()} disabled={running}>
        {running ? 'Skördar…' : 'Hämta om data'}
      </button>
      {state && (running || failed || state.ok) && (
        <div className="harvest-log" role="status" aria-live="polite">
          {failed && <p className="notice">⚠ {state.error ?? 'Skörden misslyckades.'}</p>}
          <pre>{state.log.slice(-TAIL).join('\n')}</pre>
        </div>
      )}
    </div>
  );
}
