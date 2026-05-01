import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ITimelineEntry,
  IInitMeta,
  ISessionStats,
  TTimelineConnectionStatus,
  TTimelineServerMessage,
} from '@/types/timeline';
import { nextReconnectDelay } from '@/lib/reconnect-policy';
import {
  NATIVE_APP_STATE_EVENT,
  readNativeAppStateActive,
  shouldForceForegroundReconnect,
  wasPageRestored,
} from '@/lib/foreground-reconnect';

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
  agentSessionId?: string | null;
  panelType?: string;
  enabled: boolean;
  onInit: (entries: ITimelineEntry[], totalEntries: number, sessionId: string, summary?: string, meta?: IInitMeta, startByteOffset?: number, hasMore?: boolean, jsonlPath?: string | null, isAgentStarting?: boolean, sessionStats?: ISessionStats | null) => void;
  onAppend: (entries: ITimelineEntry[]) => void;
  onSessionChanged: (newSessionId: string, reason: string) => void;
  onStatsUpdate?: (stats: ISessionStats) => void;
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
  agentSessionId,
  panelType,
  enabled,
  onInit,
  onAppend,
  onSessionChanged,
  onStatsUpdate,
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
  const hiddenAtRef = useRef<number | null>(null);

  const callbacksRef = useRef({
    onInit, onAppend, onSessionChanged, onStatsUpdate, onError,
    onResumeStarted, onResumeBlocked, onResumeError,
  });
  useEffect(() => {
    callbacksRef.current = {
      onInit, onAppend, onSessionChanged, onStatsUpdate, onError,
      onResumeStarted, onResumeBlocked, onResumeError,
    };
  }, [onInit, onAppend, onSessionChanged, onStatsUpdate, onError, onResumeStarted, onResumeBlocked, onResumeError]);

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
      if (panelType) params.set('panelType', panelType);
      if (agentSessionId) {
        params.set('agentSessionId', agentSessionId);
      }
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
              callbacksRef.current.onInit(msg.entries, msg.totalEntries, msg.sessionId, msg.summary, msg.meta, msg.startByteOffset, msg.hasMore, msg.jsonlPath, msg.isAgentStarting, msg.sessionStats);
              break;
            case 'timeline:append':
              callbacksRef.current.onAppend(msg.entries);
              break;
            case 'timeline:session-changed':
              callbacksRef.current.onSessionChanged(msg.newSessionId, msg.reason);
              break;
            case 'timeline:stats-update':
              callbacksRef.current.onStatsUpdate?.(msg.sessionStats);
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

        const delay = nextReconnectDelay(retryCountRef.current);
        retryCountRef.current++;
        setStatus('reconnecting');
        retryTimerRef.current = setTimeout(() => {
          doConnectRef.current(connectId);
        }, delay);
      };

      ws.onerror = () => {
        console.log('[timeline-ws] connection error');
      };
    },
    [sessionName, agentSessionId, panelType, clearTimers],
  );

  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

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

  useEffect(() => {
    const markHidden = () => {
      hiddenAtRef.current = Date.now();
    };

    const handleForegroundReconnect = (allowHidden = false) => {
      if (!allowHidden && document.visibilityState === 'hidden') return;
      if (!enabled) return;
      const ws = wsRef.current;
      const forceReconnect = shouldForceForegroundReconnect(hiddenAtRef.current);
      hiddenAtRef.current = null;
      if (!forceReconnect && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      retryCountRef.current = 0;
      const id = ++connectIdRef.current;
      doConnectRef.current(id);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        markHidden();
        return;
      }
      handleForegroundReconnect();
    };

    const handleForegroundEvent = () => {
      handleForegroundReconnect();
    };

    const handlePageShow = (event: PageTransitionEvent) => {
      if (wasPageRestored(event)) hiddenAtRef.current = 0;
      handleForegroundReconnect();
    };

    const handleNativeAppState = (event: Event) => {
      const active = readNativeAppStateActive(event);
      if (active === false) {
        markHidden();
        return;
      }
      if (active === true) {
        hiddenAtRef.current = hiddenAtRef.current ?? 0;
        handleForegroundReconnect(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleForegroundEvent);
    window.addEventListener('online', handleForegroundEvent);
    window.addEventListener('pagehide', markHidden);
    window.addEventListener('pageshow', handlePageShow);
    window.addEventListener(NATIVE_APP_STATE_EVENT, handleNativeAppState);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleForegroundEvent);
      window.removeEventListener('online', handleForegroundEvent);
      window.removeEventListener('pagehide', markHidden);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener(NATIVE_APP_STATE_EVENT, handleNativeAppState);
    };
  }, [enabled]);

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
