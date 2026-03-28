import { useEffect, useRef } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import type { TStatusServerMessage } from '@/types/status';

const RECONNECT_BASE = 1_000;
const RECONNECT_MAX = 30_000;

let sharedWs: WebSocket | null = null;

export const dismissTab = (tabId: string) => {
  useTabStore.getState().dismissTab(tabId);
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify({ type: 'status:tab-dismissed', tabId }));
  }
};

const useClaudeStatus = () => {
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/status`);
      sharedWs = ws;

      ws.onopen = () => {
        if (!mountedRef.current) return;
        retryCountRef.current = 0;
        useTabStore.getState().setStatusWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current) return;
        try {
          const msg = JSON.parse(event.data) as TStatusServerMessage;

          switch (msg.type) {
            case 'status:sync':
              useTabStore.getState().syncAllFromServer(msg.tabs);
              break;

            case 'status:update':
              useTabStore.getState().updateFromServer(msg.tabId, {
                cliState: msg.cliState,
                workspaceId: msg.workspaceId,
                tabName: msg.tabName,
              });
              break;
          }
        } catch {
          // invalid message
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current) return;
        useTabStore.getState().setStatusWsConnected(false);
        sharedWs = null;

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
      if (sharedWs) {
        sharedWs.close();
        sharedWs = null;
      }
    };
  }, []);
};

export default useClaudeStatus;
