import { useEffect, useRef, useCallback } from 'react';
import useClaudeStatusStore from '@/hooks/use-claude-status-store';
import type { TCliState } from '@/types/timeline';
import type { TStatusServerMessage } from '@/types/status';

const RECONNECT_BASE = 1_000;
const RECONNECT_MAX = 30_000;

const useClaudeStatus = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const { syncAll, updateTab, setConnected } = useClaudeStatusStore();

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/status`);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCountRef.current = 0;
        setConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as TStatusServerMessage;

          switch (msg.type) {
            case 'status:sync':
              syncAll(msg.tabs);
              break;

            case 'status:update':
              if (msg.cliState === null) {
                updateTab(msg.tabId, null);
              } else {
                updateTab(msg.tabId, {
                  cliState: msg.cliState,
                  dismissed: msg.dismissed,
                  workspaceId: msg.workspaceId,
                  tabName: msg.tabName,
                });
              }
              break;
          }
        } catch {
          // invalid message
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        setConnected(false);
        wsRef.current = null;

        const delay = Math.min(
          RECONNECT_BASE * Math.pow(2, retryCountRef.current),
          RECONNECT_MAX,
        );
        retryCountRef.current++;
        retryTimerRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // onclose will fire after onerror
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [syncAll, updateTab, setConnected]);

  const dismissTab = useCallback((tabId: string) => {
    useClaudeStatusStore.getState().dismissTabLocal(tabId);

    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status:tab-dismissed', tabId }));
    }
  }, []);

  const reportActiveTab = useCallback((tabId: string, cliState: TCliState) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status:tab-active-report', tabId, cliState }));
    }
  }, []);

  return { dismissTab, reportActiveTab };
};

export default useClaudeStatus;
