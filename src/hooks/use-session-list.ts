import { useState, useCallback, useEffect, useRef } from 'react';
import type { ISessionMeta } from '@/types/timeline';

const DEFAULT_LIMIT = 50;

interface IUseSessionListOptions {
  tmuxSession: string;
  enabled: boolean;
  cwd?: string;
}

interface IUseSessionListReturn {
  sessions: ISessionMeta[];
  total: number;
  hasMore: boolean;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const useSessionList = ({
  tmuxSession,
  enabled,
  cwd,
}: IUseSessionListOptions): IUseSessionListReturn => {
  const [sessions, setSessions] = useState<ISessionMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoadingMoreRef = useRef(false);

  const [prevTmuxSession, setPrevTmuxSession] = useState(tmuxSession);
  if (tmuxSession !== prevTmuxSession) {
    setPrevTmuxSession(tmuxSession);
    setSessions([]);
    setTotal(0);
    setHasMore(false);
    setIsLoading(true);
    setError(null);
  }

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;

  const fetchSessions = useCallback(async () => {
    if (!tmuxSession) return;
    setIsLoading(true);
    setError(null);

    try {
      let url = `/api/timeline/sessions?tmuxSession=${encodeURIComponent(tmuxSession)}&limit=${DEFAULT_LIMIT}&offset=0`;
      if (cwdRef.current) {
        url += `&cwd=${encodeURIComponent(cwdRef.current)}`;
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error('세션 목록을 불러올 수 없습니다');
      const data = await res.json();
      setSessions(data.sessions);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 목록을 불러올 수 없습니다');
    } finally {
      setIsLoading(false);
    }
  }, [tmuxSession]);

  useEffect(() => {
    if (enabled) {
      fetchSessions();
    }
  }, [enabled, fetchSessions]);

  const prevCwdRef = useRef(cwd);
  useEffect(() => {
    if (prevCwdRef.current !== cwd) {
      prevCwdRef.current = cwd;
      if (enabled) {
        fetchSessions();
      }
    }
  }, [cwd, enabled, fetchSessions]);

  const refetch = useCallback(async () => {
    await fetchSessions();
  }, [fetchSessions]);

  const loadMore = useCallback(async () => {
    if (!tmuxSession || isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;
    setIsLoadingMore(true);

    try {
      const offset = sessions.length;
      const res = await fetch(
        `/api/timeline/sessions?tmuxSession=${encodeURIComponent(tmuxSession)}&limit=${DEFAULT_LIMIT}&offset=${offset}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setSessions((prev) => [...prev, ...data.sessions]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [tmuxSession, hasMore, sessions.length]);

  return {
    sessions,
    total,
    hasMore,
    isLoading,
    isLoadingMore,
    error,
    refetch,
    loadMore,
  };
};

export default useSessionList;
