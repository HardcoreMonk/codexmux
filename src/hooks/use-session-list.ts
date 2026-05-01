import { useState, useCallback, useEffect, useRef } from 'react';
import type { ISessionMeta, TSessionSourceFilter } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

const DEFAULT_LIMIT = 50;

interface IUseSessionListOptions {
  tmuxSession: string;
  enabled: boolean;
  cwd?: string;
  panelType?: TPanelType;
  source?: TSessionSourceFilter;
  sourceId?: string | null;
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
  panelType = 'codex',
  source = 'all',
  sourceId = null,
}: IUseSessionListOptions): IUseSessionListReturn => {
  const [sessions, setSessions] = useState<ISessionMeta[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isLoadingMoreRef = useRef(false);

  const sessionKey = `${panelType}:${tmuxSession}:${cwd ?? ''}:${source}:${sourceId ?? ''}`;
  const [prevSessionKey, setPrevSessionKey] = useState(sessionKey);
  if (sessionKey !== prevSessionKey) {
    setPrevSessionKey(sessionKey);
    setSessions([]);
    setTotal(0);
    setHasMore(false);
    setIsLoading(true);
    setError(null);
  }

  const cwdRef = useRef(cwd);
  cwdRef.current = cwd;
  const panelTypeRef = useRef(panelType);
  panelTypeRef.current = panelType;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const sourceIdRef = useRef(sourceId);
  sourceIdRef.current = sourceId;

  const buildUrl = useCallback((offset: number) => {
    const params = new URLSearchParams({
      tmuxSession,
      limit: String(DEFAULT_LIMIT),
      offset: String(offset),
      panelType: panelTypeRef.current,
      source: sourceRef.current,
    });
    if (cwdRef.current) params.set('cwd', cwdRef.current);
    if (sourceIdRef.current) params.set('sourceId', sourceIdRef.current);
    return `/api/timeline/sessions?${params.toString()}`;
  }, [tmuxSession]);

  const fetchSessions = useCallback(async () => {
    if (!tmuxSession) return;
    setIsLoading(true);
    setError(null);

    try {
      const url = buildUrl(0);
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
  }, [buildUrl, tmuxSession]);

  useEffect(() => {
    if (enabled) {
      fetchSessions();
    }
  }, [enabled, fetchSessions, sessionKey]);

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
      const url = buildUrl(offset);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setSessions((prev) => [...prev, ...data.sessions]);
      setTotal(data.total);
      setHasMore(data.hasMore);
    } finally {
      isLoadingMoreRef.current = false;
      setIsLoadingMore(false);
    }
  }, [buildUrl, tmuxSession, hasMore, sessions.length]);

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
