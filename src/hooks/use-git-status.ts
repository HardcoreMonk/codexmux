import { useState, useEffect, useRef, useCallback } from 'react';
import type { IGitStatus } from '@/lib/git-status';
import useGitRefreshGeneration from '@/hooks/use-git-refresh-generation';
import useIsSessionActive from '@/hooks/use-is-session-active';
import { consumeGitRefreshGeneration } from '@/lib/git-refresh-generation';

const POLL_INTERVAL_MS = 30_000;

interface IUseGitStatusReturn {
  status: IGitStatus | null;
  isLoading: boolean;
}

const useGitStatus = (tmuxSession: string, enabled = true): IUseGitStatusReturn => {
  const [status, setStatus] = useState<IGitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consumedGenerationsRef = useRef<Readonly<Record<string, number>>>({});
  const generation = useGitRefreshGeneration((state) => state.generations[tmuxSession] ?? 0);
  const isActive = useIsSessionActive(tmuxSession);

  const fetchStatus = useCallback(async (force = false) => {
    try {
      const res = await fetch(
        `/api/git/status?tmuxSession=${encodeURIComponent(tmuxSession)}${force ? '&force=1' : ''}`,
      );
      if (!res.ok) {
        setStatus(null);
        return;
      }
      const data = await res.json();
      setStatus(data.status ?? null);
    } catch {
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  }, [tmuxSession]);

  useEffect(() => {
    if (!tmuxSession || !enabled) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchStatus();

    intervalRef.current = setInterval(fetchStatus, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tmuxSession, enabled, fetchStatus]);

  useEffect(() => {
    const consumption = consumeGitRefreshGeneration({
      consumed: consumedGenerationsRef.current,
      sessionName: tmuxSession,
      generation,
      active: enabled && isActive,
    });
    if (!consumption.shouldRefresh) return;
    consumedGenerationsRef.current = consumption.consumed;
    void fetchStatus(true);
  }, [enabled, fetchStatus, generation, isActive, tmuxSession]);

  return { status, isLoading };
};

export default useGitStatus;
