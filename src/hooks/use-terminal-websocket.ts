import { useCallback, useEffect, useRef, useState } from 'react';
import type { TConnectionStatus } from '@/types/terminal';
import {
  MSG_STDOUT,
  MSG_HEARTBEAT,
  encodeStdin,
  encodeResize,
  encodeHeartbeat,
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

  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const isNormalCloseRef = useRef(false);
  const callbacksRef = useRef({ onData, onConnected, onSessionEnded });

  callbacksRef.current = { onData, onConnected, onSessionEnded };

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

  const connect = useCallback(async () => {
    clearTimers();
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setStatus(retryCountRef.current > 0 ? 'reconnecting' : 'connecting');

    try {
      await fetch('/api/terminal');
    } catch {
      // WSS 초기화 실패 시 재연결 시도
      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RECONNECT_DELAYS[retryCountRef.current] ?? 16000;
        retryCountRef.current++;
        setRetryCount(retryCountRef.current);
        retryTimerRef.current = setTimeout(connect, delay);
      } else {
        setStatus('disconnected');
      }
      return;
    }

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/terminal`);
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
        setStatus('disconnected');
        return;
      }

      if (retryCountRef.current < MAX_RETRIES) {
        const delay = RECONNECT_DELAYS[retryCountRef.current] ?? 16000;
        retryCountRef.current++;
        setRetryCount(retryCountRef.current);
        setStatus('reconnecting');
        retryTimerRef.current = setTimeout(connect, delay);
      } else {
        setStatus('disconnected');
      }
    };

    ws.onerror = () => {
      // onclose will handle reconnection
    };
  }, [clearTimers]);

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

  const reconnect = useCallback(() => {
    retryCountRef.current = 0;
    setRetryCount(0);
    connect();
  }, [connect]);

  useEffect(() => {
    connect();
    return () => {
      clearTimers();
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { status, retryCount, sendStdin, sendResize, reconnect };
};

export default useTerminalWebSocket;
