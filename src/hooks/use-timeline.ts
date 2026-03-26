import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  ITimelineEntry,
  IInitMeta,
  ITaskItem,
  ISessionInfo,
  TSessionStatus,
  TTimelineConnectionStatus,
  TCliState,
} from '@/types/timeline';
import useTimelineWebSocket from '@/hooks/use-timeline-websocket';

// status-manager.ts의 JSONL_STALE_MS와 동일한 기준
const STALE_BUSY_MS = 30_000;

// 빈 세션 init 수신 후 "미실행" 표시까지 유예 시간
// Claude CLI 시작 직후 PID 파일 생성 전에 감지될 수 있는 레이스 컨디션 방지
const INIT_GRACE_MS = 2_000;

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

  if (lastEntry.type === 'assistant-message' && lastEntry.stopReason && lastEntry.stopReason !== 'tool_use') {
    return 'idle';
  }

  if (lastEntry.type === 'ask-user-question' && lastEntry.status === 'pending') {
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
  tasks: ITaskItem[];
  cliState: TCliState;
  sessionId: string | null;
  sessionSummary: string | undefined;
  initMeta: IInitMeta | undefined;
  sessionStatus: TSessionStatus;
  wsStatus: TTimelineConnectionStatus;
  isLoading: boolean;
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
  const [initMeta, setInitMeta] = useState<IInitMeta | undefined>();

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });

  const jsonlPathRef = useRef<string | null>(null);
  const startByteOffsetRef = useRef(0);
  const isLoadingMoreRef = useRef(false);
  const wsInitReceivedRef = useRef(false);
  const claudeSessionIdRef = useRef(claudeSessionId);
  useEffect(() => {
    claudeSessionIdRef.current = claudeSessionId;
  });

  const initGraceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSession = useCallback(async () => {
    if (!enabled || !sessionName) return;
    try {
      const res = await fetch(
        `/api/timeline/session?session=${encodeURIComponent(sessionName)}`,
      );
      if (!res.ok) throw new Error('세션 정보를 불러올 수 없습니다');
      const info: ISessionInfo = await res.json();
      if (wsInitReceivedRef.current) return;
      setSessionStatus(info.status);
      jsonlPathRef.current = info.jsonlPath;
      if (info.status !== 'active' && !claudeSessionIdRef.current) {
        if (!initGraceTimerRef.current) {
          initGraceTimerRef.current = setTimeout(() => {
            initGraceTimerRef.current = null;
            setIsLoading(false);
          }, INIT_GRACE_MS);
        }
      }
      setError(null);
    } catch (err) {
      if (wsInitReceivedRef.current) return;
      setError(err instanceof Error ? err.message : '세션 정보를 불러올 수 없습니다');
      setSessionStatus('none');
      setIsLoading(false);
    }
  }, [enabled, sessionName]);

  useEffect(() => {
    if (!enabled) {
      if (initGraceTimerRef.current) {
        clearTimeout(initGraceTimerRef.current);
        initGraceTimerRef.current = null;
      }
      return;
    }
    fetchSession();
  }, [fetchSession, enabled]);

  const handleInit = useCallback((newEntries: ITimelineEntry[], _totalEntries: number, initSessionId: string, summary?: string, meta?: IInitMeta, startByteOffset?: number, hasMoreInit?: boolean) => {
    wsInitReceivedRef.current = true;
    setEntries(newEntries);
    startByteOffsetRef.current = startByteOffset ?? 0;
    setHasMore(hasMoreInit ?? false);
    setSessionSummary(summary);
    setInitMeta(meta);
    if (initSessionId) {
      setSessionId(initSessionId);
    }

    if (initSessionId || newEntries.length > 0) {
      if (initGraceTimerRef.current) {
        clearTimeout(initGraceTimerRef.current);
        initGraceTimerRef.current = null;
      }
      setIsLoading(false);
    } else if (!initGraceTimerRef.current) {
      initGraceTimerRef.current = setTimeout(() => {
        initGraceTimerRef.current = null;
        setIsLoading(false);
      }, INIT_GRACE_MS);
    }
    setError(null);
  }, []);

  const handleAppend = useCallback((newEntries: ITimelineEntry[]) => {
    setEntries((prev) => {
      const updated = [...prev];
      for (const entry of newEntries) {
        if (entry.type === 'tool-result') {
          const status = entry.isError ? 'error' as const : 'success' as const;
          const tcIdx = updated.findIndex(
            (e) => e.type === 'tool-call' && e.toolUseId === entry.toolUseId,
          );
          if (tcIdx !== -1) {
            const tc = updated[tcIdx] as ITimelineEntry & { type: 'tool-call'; status: string };
            updated[tcIdx] = { ...tc, status };
          } else {
            const aqIdx = updated.findIndex(
              (e) => e.type === 'ask-user-question' && e.toolUseId === entry.toolUseId,
            );
            if (aqIdx !== -1) {
              const aq = updated[aqIdx] as ITimelineEntry & { type: 'ask-user-question'; status: string; answer?: string };
              updated[aqIdx] = { ...aq, status, answer: entry.summary || undefined };
            }
          }
        }
        updated.push(entry);
      }
      return updated;
    });
  }, []);

  const handleSessionChanged = useCallback((newSessionId: string, reason: string) => {
    if (initGraceTimerRef.current) {
      clearTimeout(initGraceTimerRef.current);
      initGraceTimerRef.current = null;
    }
    if (reason === 'session-ended') {
      setSessionStatus('none');
      setIsLoading(false);
      setEntries([]);
      setSessionSummary(undefined);
      setInitMeta(undefined);
      setHasMore(false);
      return;
    }
    setSessionId(newSessionId || null);
    setSessionStatus('active');
    setEntries([]);
    setSessionSummary(undefined);
    setInitMeta(undefined);
    setHasMore(false);
    setIsLoading(true);
  }, []);

  const loadMore = useCallback(async () => {
    if (!jsonlPathRef.current || isLoadingMoreRef.current || !hasMore) return;
    if (startByteOffsetRef.current <= 0) {
      setHasMore(false);
      return;
    }
    isLoadingMoreRef.current = true;
    try {
      const res = await fetch(
        `/api/timeline/entries?jsonlPath=${encodeURIComponent(jsonlPathRef.current)}&beforeByte=${startByteOffsetRef.current}&limit=64`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setEntries((prev) => [...(data.entries as ITimelineEntry[]), ...prev]);
      startByteOffsetRef.current = data.startByteOffset;
      setHasMore(data.hasMore);
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
      if (initGraceTimerRef.current) {
        clearTimeout(initGraceTimerRef.current);
        initGraceTimerRef.current = null;
      }
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

  const rawCliState = useMemo(
    () => isLoading ? 'inactive' as const : deriveCliState(sessionStatus, entries),
    [sessionStatus, entries, isLoading],
  );

  const lastEntryTs = entries.length > 0 ? entries[entries.length - 1].timestamp : 0;
  const [staleBusy, setStaleBusy] = useState(false);

  useEffect(() => {
    if (rawCliState !== 'busy' || lastEntryTs === 0) {
      setStaleBusy(false);
      return;
    }
    const age = Date.now() - lastEntryTs;
    if (age >= STALE_BUSY_MS) {
      setStaleBusy(true);
      return;
    }
    const timer = setTimeout(() => setStaleBusy(true), STALE_BUSY_MS - age);
    return () => clearTimeout(timer);
  }, [rawCliState, lastEntryTs]);

  const isStaleBusy = staleBusy || (rawCliState === 'busy' && lastEntryTs > 0 && Date.now() - lastEntryTs >= STALE_BUSY_MS);
  const cliState = isStaleBusy ? 'idle' as const : rawCliState;

  const tasks = useMemo((): ITaskItem[] => {
    const items: ITaskItem[] = [];
    let createIndex = 0;

    for (const entry of entries) {
      if (entry.type !== 'task-progress') continue;

      if (entry.action === 'create') {
        createIndex++;
        items.push({
          taskId: String(createIndex),
          subject: entry.subject ?? '',
          description: entry.description,
          status: entry.status,
        });
      } else if (entry.action === 'update') {
        const target = items.find((t) => t.taskId === entry.taskId);
        if (target) {
          target.status = entry.status;
        }
      }
    }

    return items;
  }, [entries]);

  return {
    entries,
    tasks,
    cliState,
    sessionId,
    sessionSummary,
    initMeta,
    sessionStatus,
    wsStatus,
    isLoading,
    error,
    loadMore,
    hasMore,
    retrySession,
    sendResume,
  };
};

export default useTimeline;
