import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  ITimelineEntry,
  ISessionInfo,
  TSessionStatus,
  TTimelineConnectionStatus,
} from '@/types/timeline';
import useTimelineWebSocket from '@/hooks/use-timeline-websocket';

interface IUseTimelineOptions {
  sessionName: string;
  workspaceId: string;
  enabled: boolean;
}

interface IUseTimelineReturn {
  entries: ITimelineEntry[];
  sessionStatus: TSessionStatus;
  wsStatus: TTimelineConnectionStatus;
  isAutoScrollEnabled: boolean;
  setAutoScrollEnabled: (enabled: boolean) => void;
  isLoading: boolean;
  error: string | null;
}

const useTimeline = ({
  sessionName,
  workspaceId,
  enabled,
}: IUseTimelineOptions): IUseTimelineReturn => {
  const [entries, setEntries] = useState<ITimelineEntry[]>([]);
  const [sessionStatus, setSessionStatus] = useState<TSessionStatus>('none');
  const [isAutoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const entriesRef = useRef(entries);
  useEffect(() => {
    entriesRef.current = entries;
  });

  useEffect(() => {
    if (!enabled || !workspaceId) return;

    const fetchSession = async () => {
      try {
        const res = await fetch(
          `/api/timeline/session?workspace=${encodeURIComponent(workspaceId)}`,
        );
        if (!res.ok) throw new Error('세션 정보를 불러올 수 없습니다');
        const info: ISessionInfo = await res.json();
        setSessionStatus(info.status);
      } catch (err) {
        setError(err instanceof Error ? err.message : '세션 정보를 불러올 수 없습니다');
        setSessionStatus('none');
      }
    };

    fetchSession();
  }, [enabled, workspaceId]);

  const handleInit = useCallback((newEntries: ITimelineEntry[]) => {
    setEntries(newEntries);
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

  const handleSessionChanged = useCallback(() => {
    setEntries([]);
    setIsLoading(true);
    setAutoScrollEnabled(true);
  }, []);

  const handleError = useCallback((err: { code: string; message: string }) => {
    console.warn(`[timeline] WebSocket error: ${err.code} — ${err.message}`);
  }, []);

  const shouldConnect = enabled && (sessionStatus === 'active' || sessionStatus === 'inactive');

  const { status: wsStatus } = useTimelineWebSocket({
    sessionName,
    workspaceId,
    enabled: shouldConnect,
    onInit: handleInit,
    onAppend: handleAppend,
    onSessionChanged: handleSessionChanged,
    onError: handleError,
  });

  return {
    entries,
    sessionStatus,
    wsStatus,
    isAutoScrollEnabled,
    setAutoScrollEnabled,
    isLoading,
    error,
  };
};

export default useTimeline;
