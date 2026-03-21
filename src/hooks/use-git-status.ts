import { useState, useEffect, useRef, useCallback } from 'react';
import type { IGitStatus } from '@/lib/git-status';

const POLL_INTERVAL_MS = 30_000;

interface IUseGitStatusReturn {
  status: IGitStatus | null;
  isLoading: boolean;
}

const useGitStatus = (tmuxSession: string, enabled = true): IUseGitStatusReturn => {
  const [status, setStatus] = useState<IGitStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/git/status?tmuxSession=${encodeURIComponent(tmuxSession)}`,
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

  return { status, isLoading };
};

export default useGitStatus;
