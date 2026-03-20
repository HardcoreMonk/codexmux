import { useCallback, useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import type { TConnectionStatus, TDisconnectReason } from '@/types/terminal';
import {
  MSG_STDOUT,
  MSG_HEARTBEAT,
  encodeStdin,
  encodeResize,
  encodeHeartbeat,
  encodeKillSession,
  decodeMessage,
} from '@/lib/terminal-protocol';

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000];
const MAX_RETRIES = 5;
const HEARTBEAT_INTERVAL = 30_000;

interface IUseTerminalWebSocketOptions {
  onData?: (data: Uint8Array) => void;
  onConnected?: () => void;
  onSessionEnded?: () => void;
}

const useTerminalWebSocket = ({
  onData,
  onConnected,
  onSessionEnded,
}: IUseTerminalWebSocketOptions = {}) => {
  const [status, setStatus] = useState<TConnectionStatus>('connecting');
  const [retryCount, setRetryCount] = useState(0);
  const [disconnectReason, setDisconnectReason] =
    useState<TDisconnectReason>(null);

  const clientIdRef = useRef(nanoid());
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const isNormalCloseRef = useRef(false);
  const callbacksRef = useRef({ onData, onConnected, onSessionEnded });
  const connectRef = useRef<() => void>(() => {});

  useEffect(() => {
    callbacksRef.current = { onData, onConnected, onSessionEnded };
  });

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

  const connect = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setDisconnectReason(null);
    setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(
      `${protocol}//${location.host}/api/terminal?clientId=${clientIdRef.current}`,
    );
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;
    isNormalCloseRef.current = false;

    ws.onopen = () => {
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
      clearTimers();
      wsRef.current = null;

      if (event.code === 1000) {
        isNormalCloseRef.current = true;
        setStatus('session-ended');
        callbacksRef.current.onSessionEnded?.();
        return;
      }

      if (event.code === 1013) {
        setDisconnectReason('max-connections');
        setStatus('disconnected');
        return;
      }

      if (event.code === 1011) {
        setDisconnectReason('pty-error');
        setStatus('disconnected');
        return;
      }

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RECONNECT_DELAYS[retryCountRef.current] ?? 16000;
        retryCountRef.current++;
        setRetryCount(retryCountRef.current);
        setStatus('reconnecting');
        retryTimerRef.current = setTimeout(
          () => connectRef.current(),
          delay,
        );
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnection
    };
  }, [clearTimers]);

  useEffect(() => {
    connectRef.current = connect;
  });

  const sendStdin = useCallback((data: string) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeStdin(data));
    }
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeResize(cols, rows));
    }
  }, []);

  const sendKillSession = useCallback(() => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(encodeKillSession());
    }
  }, []);

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    connectRef.current();
  }, []);

  useEffect(() => {
    connectRef.current();
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, retryCount, disconnectReason, sendStdin, sendResize, sendKillSession, reconnect };
};

export default useTerminalWebSocket;
