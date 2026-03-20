import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ITimelineEntry,
  TTimelineConnectionStatus,
  TTimelineServerMessage,
} from '@/types/timeline';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;

interface IUseTimelineWebSocketOptions {
  sessionName: string;
  workspaceId: string;
  enabled: boolean;
  onInit: (entries: ITimelineEntry[], totalEntries: number) => void;
  onAppend: (entries: ITimelineEntry[]) => void;
  onSessionChanged: (newSessionId: string) => void;
  onError?: (error: { code: string; message: string }) => void;
}

interface IUseTimelineWebSocketReturn {
  status: TTimelineConnectionStatus;
  subscribe: (jsonlPath: string) => void;
  unsubscribe: () => void;
  reconnect: () => void;
}

const useTimelineWebSocket = ({
  sessionName,
  workspaceId,
  enabled,
  onInit,
  onAppend,
  onSessionChanged,
  onError,
}: IUseTimelineWebSocketOptions): IUseTimelineWebSocketReturn => {
  const [status, setStatus] = useState<TTimelineConnectionStatus>('disconnected');
  const [connectTrigger, setConnectTrigger] = useState(0);

  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const connectIdRef = useRef(0);

  const callbacksRef = useRef({ onInit, onAppend, onSessionChanged, onError });
  useEffect(() => {
    callbacksRef.current = { onInit, onAppend, onSessionChanged, onError };
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
      const ws = new WebSocket(
        `${protocol}//${location.host}/api/timeline?session=${sessionName}&workspace=${workspaceId}`,
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
              callbacksRef.current.onInit(msg.entries, msg.totalEntries);
              break;
            case 'timeline:append':
              callbacksRef.current.onAppend(msg.entries);
              break;
            case 'timeline:session-changed':
              callbacksRef.current.onSessionChanged(msg.newSessionId);
              break;
            case 'timeline:error':
              callbacksRef.current.onError?.({ code: msg.code, message: msg.message });
              break;
          }
        } catch {}
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

      ws.onerror = () => {};
    },
    [sessionName, workspaceId, clearTimers],
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
  }, [enabled, sessionName, workspaceId, connectTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return { status, subscribe, unsubscribe, reconnect };
};

export default useTimelineWebSocket;
