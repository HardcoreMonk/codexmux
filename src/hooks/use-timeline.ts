import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type {
  ITimelineEntry,
  IInitMeta,
  ITaskItem,
  TSessionStatus,
  TTimelineConnectionStatus,
  TCliState,
} from '@/types/timeline';
import useTimelineWebSocket from '@/hooks/use-timeline-websocket';

// status-manager.ts의 JSONL_STALE_MS와 동일한 기준
const STALE_BUSY_MS = 30_000;

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
  const [wsInitReceived, setWsInitReceived] = useState(false);
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

  const isLoading = !wsInitReceived;

  const handleInit = useCallback((newEntries: ITimelineEntry[], _totalEntries: number, initSessionId: string, summary?: string, meta?: IInitMeta, startByteOffset?: number, hasMoreInit?: boolean, jsonlPath?: string | null) => {
    setWsInitReceived(true);
    setEntries(newEntries);
    startByteOffsetRef.current = startByteOffset ?? 0;
    setHasMore(hasMoreInit ?? false);
    setSessionSummary(summary);
    setInitMeta(meta);
    if (jsonlPath) {
      jsonlPathRef.current = jsonlPath;
    }
    if (initSessionId) {
      setSessionId(initSessionId);
      setSessionStatus('active');
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
    if (reason === 'session-ended') {
      setSessionStatus('none');
      setWsInitReceived(true);
      setEntries([]);
      setSessionSummary(undefined);
      setInitMeta(undefined);
      setHasMore(false);
      return;
    }
    if (reason === 'session-waiting') {
      setSessionStatus('active');
      setWsInitReceived(false);
      if (newSessionId) setSessionId(newSessionId);
      return;
    }
    setSessionId(newSessionId || null);
    setSessionStatus('active');
    setEntries([]);
    setSessionSummary(undefined);
    setInitMeta(undefined);
    setHasMore(false);
    setWsInitReceived(false);
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
        `/api/timeline/entries?jsonlPath=${encodeURIComponent(jsonlPathRef.current)}&beforeByte=${startByteOffsetRef.current}&limit=128`,
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
    if (err.code === 'not-installed') {
      setSessionStatus('not-installed');
      return;
    }
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
      setWsInitReceived(false);
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

  const { status: wsStatus, reconnect, sendResume } = useTimelineWebSocket({
    sessionName,
    claudeSessionId,
    enabled,
    onInit: handleInit,
    onAppend: handleAppend,
    onSessionChanged: handleSessionChanged,
    onError: handleError,
    onResumeStarted: handleResumeStarted,
    onResumeBlocked: handleResumeBlocked,
    onResumeError: handleResumeError,
  });

  const retrySession = useCallback(() => {
    setError(null);
    reconnect();
  }, [reconnect]);

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
