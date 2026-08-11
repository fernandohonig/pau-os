import { useCallback, useState } from 'react';

/** Wraps async handlers with busy + error state (mirrors the old guard()). */
export function useAction(): {
  busy: boolean;
  error: string | null;
  setError: (e: string | null) => void;
  run: (fn: () => Promise<void>) => Promise<void>;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setBusy(false);
    }
  }, []);

  return { busy, error, setError, run };
}
