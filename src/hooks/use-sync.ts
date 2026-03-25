import { useEffect, useRef } from 'react';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useLayoutStore } from '@/hooks/use-layout';

const RECONNECT_DELAY = 3000;

const useSync = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/sync`);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'workspace') {
            useWorkspaceStore.getState().syncWorkspaces();
          }

          if (data.type === 'layout') {
            const activeWsId = useWorkspaceStore.getState().activeWorkspaceId;
            if (data.workspaceId === activeWsId) {
              useLayoutStore.getState().fetchLayout(activeWsId);
            }
          }
        } catch (err) {
          console.log(`[sync-ws] message parse error: ${err instanceof Error ? err.message : err}`);
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (mountedRef.current) {
          timerRef.current = setTimeout(connect, RECONNECT_DELAY);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);
};

export default useSync;
