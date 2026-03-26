import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ITimelineEntry,
  IInitMeta,
  TTimelineConnectionStatus,
  TTimelineServerMessage,
} from '@/types/timeline';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

interface IResumeStartedPayload {
  sessionId: string;
  jsonlPath: string | null;
}

interface IResumeBlockedPayload {
  reason: string;
  processName?: string;
}

interface IResumeErrorPayload {
  message: string;
}

interface IUseTimelineWebSocketOptions {
  sessionName: string;
  claudeSessionId?: string | null;
  enabled: boolean;
  onInit: (entries: ITimelineEntry[], totalEntries: number, sessionId: string, summary?: string, meta?: IInitMeta, startByteOffset?: number, hasMore?: boolean) => void;
  onAppend: (entries: ITimelineEntry[]) => void;
  onSessionChanged: (newSessionId: string, reason: string) => void;
  onError?: (error: { code: string; message: string }) => void;
  onResumeStarted?: (payload: IResumeStartedPayload) => void;
  onResumeBlocked?: (payload: IResumeBlockedPayload) => void;
  onResumeError?: (payload: IResumeErrorPayload) => void;
}

interface IUseTimelineWebSocketReturn {
  status: TTimelineConnectionStatus;
  subscribe: (jsonlPath: string) => void;
  unsubscribe: () => void;
  reconnect: () => void;
  sendResume: (sessionId: string, tmuxSession: string) => void;
}

const useTimelineWebSocket = ({
  sessionName,
  claudeSessionId,
  enabled,
  onInit,
  onAppend,
  onSessionChanged,
  onError,
  onResumeStarted,
  onResumeBlocked,
  onResumeError,
}: IUseTimelineWebSocketOptions): IUseTimelineWebSocketReturn => {
  const [status, setStatus] = useState<TTimelineConnectionStatus>('disconnected');
  const [connectTrigger, setConnectTrigger] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectIdRef = useRef(0);

  const callbacksRef = useRef({
    onInit, onAppend, onSessionChanged, onError,
    onResumeStarted, onResumeBlocked, onResumeError,
  });
  useEffect(() => {
    callbacksRef.current = {
      onInit, onAppend, onSessionChanged, onError,
      onResumeStarted, onResumeBlocked, onResumeError,
    };
  });

  const doConnectRef = useRef<(connectId: number) => void>(() => {});

  const clearTimers = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const doConnect = useCallback(
    (connectId: number) => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({ session: sessionName });
      if (claudeSessionId) params.set('claudeSessionId', claudeSessionId);
      const ws = new WebSocket(
        `${protocol}//${location.host}/api/timeline?${params}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        if (connectIdRef.current !== connectId) return;
        setStatus('connected');
        retryCountRef.current = 0;
      };

      ws.onmessage = (event: MessageEvent) => {
        if (connectIdRef.current !== connectId) return;
        try {
          const msg = JSON.parse(event.data) as TTimelineServerMessage;
          switch (msg.type) {
            case 'timeline:init':
              callbacksRef.current.onInit(msg.entries, msg.totalEntries, msg.sessionId, msg.summary, msg.meta, msg.startByteOffset, msg.hasMore);
              break;
            case 'timeline:append':
              callbacksRef.current.onAppend(msg.entries);
              break;
            case 'timeline:session-changed':
              callbacksRef.current.onSessionChanged(msg.newSessionId, msg.reason);
              break;
            case 'timeline:error':
              callbacksRef.current.onError?.({ code: msg.code, message: msg.message });
              break;
            case 'timeline:resume-started':
              callbacksRef.current.onResumeStarted?.({
                sessionId: msg.sessionId,
                jsonlPath: msg.jsonlPath,
              });
              break;
            case 'timeline:resume-blocked':
              callbacksRef.current.onResumeBlocked?.({
                reason: msg.reason,
                processName: msg.processName,
              });
              break;
            case 'timeline:resume-error':
              callbacksRef.current.onResumeError?.({ message: msg.message });
              break;
          }
        } catch (err) {
          console.log(`[timeline-ws] message parse error: ${err instanceof Error ? err.message : err}`);
        }
      };

      ws.onclose = () => {
        if (connectIdRef.current !== connectId) return;
        clearTimers();
        wsRef.current = null;

        if (retryCountRef.current < MAX_RETRIES) {
          const delay = RECONNECT_DELAYS[retryCountRef.current] ?? 16000;
          retryCountRef.current++;
          setStatus('reconnecting');
          retryTimerRef.current = setTimeout(() => {
            doConnectRef.current(connectId);
          }, delay);
        } else {
          setStatus('disconnected');
        }
      };

      ws.onerror = () => {
        console.log('[timeline-ws] connection error');
      };
    },
    [sessionName, claudeSessionId, clearTimers],
  );

  useEffect(() => {
    doConnectRef.current = doConnect;
  });

  useEffect(() => {
    if (!enabled) {
      ++connectIdRef.current;
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    retryCountRef.current = 0;
    const id = ++connectIdRef.current;
    doConnect(id);

    return () => {
      connectIdRef.current = id + 1;
      clearTimers();
      if (wsRef.current) {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'timeline:unsubscribe' }));
        }
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [enabled, sessionName, connectTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const subscribe = useCallback((jsonlPath: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'timeline:subscribe', jsonlPath }));
    }
  }, []);

  const unsubscribe = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'timeline:unsubscribe' }));
    }
  }, []);

  const reconnect = useCallback(() => {
    setConnectTrigger((prev) => prev + 1);
  }, []);

  const sendResume = useCallback((sessionId: string, tmuxSession: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'timeline:resume', sessionId, tmuxSession }));
    }
  }, []);

  return { status, subscribe, unsubscribe, reconnect, sendResume };
};

export default useTimelineWebSocket;
