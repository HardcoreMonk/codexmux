import { useState, useEffect, useRef, useCallback } from 'react';
import useGitRefreshGeneration from '@/hooks/use-git-refresh-generation';
import useIsSessionActive from '@/hooks/use-is-session-active';
import { consumeGitRefreshGeneration } from '@/lib/git-refresh-generation';

const POLL_INTERVAL_MS = 30_000;

interface IUseGitBranchReturn {
  branch: string | null;
  isLoading: boolean;
}

const useGitBranch = (tmuxSession: string): IUseGitBranchReturn => {
  const [branch, setBranch] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const consumedGenerationsRef = useRef<Readonly<Record<string, number>>>({});
  const generation = useGitRefreshGeneration((state) => state.generations[tmuxSession] ?? 0);
  const isActive = useIsSessionActive(tmuxSession);

  const fetchBranch = useCallback(async (force = false) => {
    try {
      const res = await fetch(
        `/api/git/branch?tmuxSession=${encodeURIComponent(tmuxSession)}${force ? '&force=1' : ''}`,
      );
      if (!res.ok) {
        setBranch(null);
        return;
      }
      const data = await res.json();
      setBranch(data.branch ?? null);
    } catch {
      setBranch(null);
    } finally {
      setIsLoading(false);
    }
  }, [tmuxSession]);

  useEffect(() => {
    if (!tmuxSession) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    fetchBranch();

    intervalRef.current = setInterval(fetchBranch, POLL_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [tmuxSession, fetchBranch]);

  useEffect(() => {
    const consumption = consumeGitRefreshGeneration({
      consumed: consumedGenerationsRef.current,
      sessionName: tmuxSession,
      generation,
      active: isActive,
    });
    if (!consumption.shouldRefresh) return;
    consumedGenerationsRef.current = consumption.consumed;
    void fetchBranch(true);
  }, [fetchBranch, generation, isActive, tmuxSession]);

  return { branch, isLoading };
};

export default useGitBranch;
