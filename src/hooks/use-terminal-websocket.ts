import { useCallback, useEffect, useRef, useState } from 'react';
import type { TConnectionStatus, TDisconnectReason } from '@/types/terminal';
import {
  MSG_STDOUT,
  MSG_HEARTBEAT,
  encodeStdin,
  encodeWebStdin,
  encodeResize,
  encodeHeartbeat,
  decodeMessage,
} from '@/lib/terminal-protocol';
import { isRetriableTerminalClose, nextReconnectDelay } from '@/lib/reconnect-policy';
import {
  NATIVE_APP_STATE_EVENT,
  nextForegroundReconnectErrorSuppressUntil,
  readNativeAppStateActive,
  shouldForceForegroundReconnect,
  shouldSuppressForegroundReconnectError,
  wasPageRestored,
} from '@/lib/foreground-reconnect';
import {
  buildTerminalWebSocketUrl,
  getOrCreateTerminalClientId,
  type TTerminalWebSocketEndpoint,
} from '@/lib/terminal-websocket-url';
import { preflightTerminalRuntime } from '@/lib/terminal-runtime-preflight';

const HEARTBEAT_INTERVAL = 30_000;

interface IUseTerminalWebSocketOptions {
  endpoint?: TTerminalWebSocketEndpoint;
  sourceId?: string;
  terminalId?: string;
  onData?: (data: Uint8Array) => void;
  onConnected?: () => void;
  onSessionEnded?: () => void;
}

const useTerminalWebSocket = ({
  endpoint = '/api/terminal',
  sourceId,
  terminalId,
  onData,
  onConnected,
  onSessionEnded,
}: IUseTerminalWebSocketOptions = {}) => {
  const [status, setStatus] = useState<TConnectionStatus>('disconnected');
  const [retryCount, setRetryCount] = useState(0);
  const [disconnectReason, setDisconnectReason] =
    useState<TDisconnectReason>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const sessionNameRef = useRef('');
  const connectIdRef = useRef(0);
  const initialSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const hiddenAtRef = useRef<number | null>(null);
  const foregroundReconnectErrorSuppressUntilRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onData, onConnected, onSessionEnded });
  const doConnectRef = useRef<(sessionName: string, connectId: number) => void>(() => {});

  useEffect(() => {
    callbacksRef.current = { onData, onConnected, onSessionEnded };
  }, [onData, onConnected, onSessionEnded]);

  const clearTimers = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const doConnect = useCallback(
    (sessionName: string, connectId: number) => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }

      setDisconnectReason(null);
      setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

      const openSocket = (): void => {
        const clientId = getOrCreateTerminalClientId(sessionName);
        const size = initialSizeRef.current;
        const ws = new WebSocket(buildTerminalWebSocketUrl({
          endpoint,
          clientId,
          sessionName,
          sourceId,
          terminalId,
          ...(size ? { cols: size.cols, rows: size.rows } : {}),
        }));
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          if (connectIdRef.current !== connectId) return;
          setStatus('connected');
          retryCountRef.current = 0;
          setRetryCount(0);
          callbacksRef.current.onConnected?.();

          heartbeatRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(encodeHeartbeat());
            }
          }, HEARTBEAT_INTERVAL);
        };

        ws.onmessage = (event: MessageEvent) => {
          if (connectIdRef.current !== connectId) return;
          const { type, payload } = decodeMessage(event.data as ArrayBuffer);

          switch (type) {
            case MSG_STDOUT:
              callbacksRef.current.onData?.(payload);
              break;
            case MSG_HEARTBEAT:
              break;
          }
        };

        ws.onclose = (event: CloseEvent) => {
          if (connectIdRef.current !== connectId) return;
          clearTimers();
          wsRef.current = null;

          if (event.code === 1000) {
            setStatus('session-ended');
            callbacksRef.current.onSessionEnded?.();
            return;
          }

          if (event.code === 1011) {
            setDisconnectReason('session-not-found');
            setStatus('disconnected');
            return;
          }

          if (event.code === 1013) {
            setDisconnectReason('max-connections');
            setStatus('disconnected');
            return;
          }

          if (!isRetriableTerminalClose(event.code)) {
            setStatus('disconnected');
            return;
          }

          const delay = nextReconnectDelay(retryCountRef.current);
          retryCountRef.current++;
          setRetryCount(retryCountRef.current);
          setStatus('reconnecting');
          retryTimerRef.current = setTimeout(() => {
            if (!sessionNameRef.current) return;
            doConnectRef.current(sessionNameRef.current, connectId);
          }, delay);
        };

        ws.onerror = () => {
          if (connectIdRef.current !== connectId) return;
          if (shouldSuppressForegroundReconnectError(foregroundReconnectErrorSuppressUntilRef.current)) return;
          console.log('[terminal-ws] connection error');
        };
      };

      void preflightTerminalRuntime({ endpoint }).then((result) => {
        if (connectIdRef.current !== connectId) return;
        if (!result.ok) {
          setDisconnectReason(result.reason ?? null);
          setStatus('disconnected');
          return;
        }
        openSocket();
      });
    },
    [clearTimers, endpoint, sourceId, terminalId],
  );

  useEffect(() => {
    doConnectRef.current = doConnect;
  }, [doConnect]);

  const connect = useCallback(
    (sessionName: string, cols?: number, rows?: number) => {
      sessionNameRef.current = sessionName;
      initialSizeRef.current = cols && rows ? { cols, rows } : null;
      retryCountRef.current = 0;
      setRetryCount(0);
      connectIdRef.current++;
      doConnect(sessionName, connectIdRef.current);
    },
    [doConnect],
  );

  const disconnect = useCallback(() => {
    connectIdRef.current++;
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    sessionNameRef.current = '';
    setStatus('disconnected');
  }, [clearTimers]);

  const reconnect = useCallback(() => {
    if (!sessionNameRef.current) return;
    retryCountRef.current = 0;
    setRetryCount(0);
    connectIdRef.current++;
    doConnect(sessionNameRef.current, connectIdRef.current);
  }, [doConnect]);

  const sendStdin = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeStdin(data));
    }
  }, []);

  const sendWebStdin = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeWebStdin(data));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeResize(cols, rows));
    }
  }, []);

  useEffect(() => {
    return () => {
      connectIdRef.current++; // eslint-disable-line react-hooks/exhaustive-deps -- intentional mutation to invalidate pending callbacks
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const markHidden = () => {
      hiddenAtRef.current = Date.now();
    };

    const handleForegroundReconnect = (allowHidden = false) => {
      if (!allowHidden && document.visibilityState === 'hidden') return;
      if (!sessionNameRef.current) return;
      const ws = wsRef.current;
      const forceReconnect = shouldForceForegroundReconnect(hiddenAtRef.current);
      hiddenAtRef.current = null;
      if (!forceReconnect && ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      retryCountRef.current = 0;
      setRetryCount(0);
      if (forceReconnect) {
        foregroundReconnectErrorSuppressUntilRef.current = nextForegroundReconnectErrorSuppressUntil();
      }
      connectIdRef.current++;
      doConnectRef.current(sessionNameRef.current, connectIdRef.current);
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
  }, []);

  return {
    status,
    retryCount,
    disconnectReason,
    connect,
    disconnect,
    reconnect,
    sendStdin,
    sendWebStdin,
    sendResize,
  };
};

export default useTerminalWebSocket;
