import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  ITimelineEntry,
  ISessionInfo,
  TSessionStatus,
  TTimelineConnectionStatus,
  TCliState,
} from '@/types/timeline';
import useTimelineWebSocket from '@/hooks/use-timeline-websocket';

const deriveCliState = (
  sessionStatus: TSessionStatus,
  entries: ITimelineEntry[],
): TCliState => {
  if (sessionStatus !== 'active') {
    return 'inactive';
  }

  if (entries.length === 0) {
    return 'idle';
  }

  const lastEntry = entries[entries.length - 1];
  if (lastEntry.type === 'turn-end' || lastEntry.type === 'interrupt' || lastEntry.type === 'session-exit') {
    return 'idle';
  }

  return 'busy';
};

interface IResumeCallbacks {
  onResumeStarted?: (payload: { sessionId: string; jsonlPath: string | null }) => void;
  onResumeBlocked?: (payload: { reason: string; processName?: string }) => void;
  onResumeError?: (payload: { message: string }) => void;
}

interface IUseTimelineOptions {
  sessionName: string;
  claudeSessionId?: string | null;
  enabled: boolean;
  resumeCallbacks?: IResumeCallbacks;
}

interface IUseTimelineReturn {
  entries: ITimelineEntry[];
  cliState: TCliState;
  sessionId: string | null;
  sessionSummary: string | undefined;
  sessionStatus: TSessionStatus;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
  isSessionTransitioning: boolean;
  error: string | null;
  loadMore: () => Promise<void>;
  hasMore: boolean;
  retrySession: () => void;
  sendResume: (sessionId: string, tmuxSession: string) => void;
}

const useTimeline = ({
  sessionName,
  claudeSessionId,
  enabled,
  resumeCallbacks,
}: IUseTimelineOptions): IUseTimelineReturn => {
  const [entries, setEntries] = useState<ITimelineEntry[]>([]);
  const [sessionStatus, setSessionStatus] = useState<TSessionStatus>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionSummary, setSessionSummary] = useState<string | undefined>();

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });

  const jsonlPathRef = useRef<string | null>(null);
  const totalEntriesRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const claudeSessionIdRef = useRef(claudeSessionId);
  useEffect(() => {
    claudeSessionIdRef.current = claudeSessionId;
  });

  const fetchSession = useCallback(async () => {
    if (!enabled || !sessionName) return;
    try {
      const res = await fetch(
        `/api/timeline/session?session=${encodeURIComponent(sessionName)}`,
      );
      if (!res.ok) throw new Error('세션 정보를 불러올 수 없습니다');
      const info: ISessionInfo = await res.json();
      setSessionStatus(info.status);
      jsonlPathRef.current = info.jsonlPath;
      if (info.status !== 'active' && !claudeSessionIdRef.current) {
        setIsLoading(false);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '세션 정보를 불러올 수 없습니다');
      setSessionStatus('none');
    }
  }, [enabled, sessionName]);

  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  const handleInit = useCallback((newEntries: ITimelineEntry[], totalEntries: number, initSessionId: string, summary?: string) => {
    setEntries(newEntries);
    totalEntriesRef.current = totalEntries;
    setHasMore(newEntries.length < totalEntries);
    setSessionSummary(summary);
    if (initSessionId) {
      setSessionId(initSessionId);
    }
    setIsLoading(false);
    setError(null);
  }, []);

  const handleAppend = useCallback((newEntries: ITimelineEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev];
      for (const entry of newEntries) {
        if (entry.type === 'tool-result') {
          const idx = updated.findIndex(
            (e) => e.type === 'tool-call' && e.toolUseId === entry.toolUseId,
          );
          if (idx !== -1) {
            const tc = updated[idx] as ITimelineEntry & { type: 'tool-call'; status: string };
            updated[idx] = { ...tc, status: entry.isError ? 'error' : 'success' };
          }
        }
        updated.push(entry);
      }
      return updated;
    });
  }, []);

  const handleSessionChanged = useCallback((newSessionId: string, reason: string) => {
    if (reason === 'session-ended') {
      setSessionStatus('none');
      setIsLoading(false);
      setEntries([]);
      setSessionSummary(undefined);
      setHasMore(false);
      return;
    }
    setSessionId(newSessionId || null);
    setSessionStatus('active');
    if (reason !== 'session-waiting') {
      setEntries([]);
      setSessionSummary(undefined);
      setHasMore(false);
      setIsLoading(true);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!jsonlPathRef.current || isLoadingMoreRef.current || !hasMore) return;
    isLoadingMoreRef.current = true;
    try {
      const currentCount = entriesRef.current.length;
      const offset = Math.max(0, totalEntriesRef.current - currentCount - 200);
      const limit = Math.min(200, totalEntriesRef.current - currentCount);
      if (limit <= 0) {
        setHasMore(false);
        return;
      }
      const res = await fetch(
        `/api/timeline/entries?jsonlPath=${encodeURIComponent(jsonlPathRef.current)}&offset=${offset}&limit=${limit}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setEntries((prev) => [...(data.entries as ITimelineEntry[]), ...prev]);
      setHasMore(offset > 0);
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [hasMore]);

  const handleError = useCallback((err: { code: string; message: string }) => {
    console.warn(`[timeline] WebSocket error: ${err.code} — ${err.message}`);
  }, []);

  const resumeCallbacksRef = useRef(resumeCallbacks);
  useEffect(() => {
    resumeCallbacksRef.current = resumeCallbacks;
  });

  const handleResumeStarted = useCallback(
    (payload: { sessionId: string; jsonlPath: string | null }) => {
      if (payload.jsonlPath) {
        jsonlPathRef.current = payload.jsonlPath;
      }
      setSessionId(payload.sessionId);
      setSessionStatus('active');
      setEntries([]);
      setIsLoading(true);
      resumeCallbacksRef.current?.onResumeStarted?.(payload);
    },
    [],
  );

  const handleResumeBlocked = useCallback(
    (payload: { reason: string; processName?: string }) => {
      resumeCallbacksRef.current?.onResumeBlocked?.(payload);
    },
    [],
  );

  const handleResumeError = useCallback(
    (payload: { message: string }) => {
      resumeCallbacksRef.current?.onResumeError?.(payload);
    },
    [],
  );

  const shouldConnect = enabled && sessionStatus !== 'not-installed';

  const { status: wsStatus, reconnect, sendResume } = useTimelineWebSocket({
    sessionName,
    claudeSessionId,
    enabled: shouldConnect,
    onInit: handleInit,
    onAppend: handleAppend,
    onSessionChanged: handleSessionChanged,
    onError: handleError,
    onResumeStarted: handleResumeStarted,
    onResumeBlocked: handleResumeBlocked,
    onResumeError: handleResumeError,
  });

  const retrySession = useCallback(async () => {
    setError(null);
    await fetchSession();
    reconnect();
  }, [fetchSession, reconnect]);

  const cliState = useMemo(
    () => deriveCliState(sessionStatus, entries),
    [sessionStatus, entries],
  );

  return {
    entries,
    cliState,
    sessionId,
    sessionSummary,
    sessionStatus,
    wsStatus,
    isLoading,
    isSessionTransitioning: false,
    error,
    loadMore,
    hasMore,
    retrySession,
    sendResume,
  };
};

export default useTimeline;
