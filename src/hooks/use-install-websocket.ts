import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeStdin, encodeResize, decodeMessage, MSG_STDOUT } from '@/lib/terminal-protocol';

type TInstallStatus = 'idle' | 'connected' | 'disconnected';

interface IUseInstallWebSocket {
  status: TInstallStatus;
  connect: (command: string, cols: number, rows: number) => void;
  disconnect: () => void;
  sendStdin: (data: string) => void;
  sendResize: (cols: number, rows: number) => void;
}

const useInstallWebSocket = (onData: (data: Uint8Array) => void): IUseInstallWebSocket => {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<TInstallStatus>('idle');
  const onDataRef = useRef(onData);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const disconnect = useCallback(() => {
    const ws = wsRef.current;
    if (ws) {
      ws.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => () => { wsRef.current?.close(); }, []);

  const connect = useCallback((command: string, cols: number, rows: number) => {
    disconnect();

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/api/install?command=${encodeURIComponent(command)}&cols=${cols}&rows=${rows}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');

    ws.onmessage = (event) => {
      const msg = decodeMessage(event.data as ArrayBuffer);
      if (msg.type === MSG_STDOUT) {
        onDataRef.current(msg.payload);
      }
    };

    ws.onclose = () => {
      wsRef.current = null;
      setStatus('disconnected');
    };

    ws.onerror = () => {
      wsRef.current = null;
      setStatus('disconnected');
    };
  }, [disconnect]);

  const sendStdin = useCallback((data: string) => {
    wsRef.current?.send(encodeStdin(data));
  }, []);

  const sendResize = useCallback((cols: number, rows: number) => {
    wsRef.current?.send(encodeResize(cols, rows));
  }, []);

  return { status, connect, disconnect, sendStdin, sendResize };
};

export default useInstallWebSocket;
