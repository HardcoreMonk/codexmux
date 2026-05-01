import { useEffect, useRef } from 'react';
import useTabStore from '@/hooks/use-tab-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import useRateLimitsStore from '@/hooks/use-rate-limits-store';
import useSessionHistoryStore from '@/hooks/use-session-history-store';
import { formatTabTitle } from '@/lib/tab-title';
import {
  NATIVE_APP_STATE_EVENT,
  readNativeAppStateActive,
  shouldForceForegroundReconnect,
  wasPageRestored,
} from '@/lib/foreground-reconnect';
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

export const requestSync = () => {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify({ type: 'status:request-sync' }));
  }
};

export const ackNotificationInput = (tabId: string, seq: number) => {
  if (sharedWs?.readyState === WebSocket.OPEN) {
    sharedWs.send(JSON.stringify({ type: 'status:ack-notification', tabId, seq }));
  }
};

const useAgentStatus = () => {
  const retryCountRef = useRef(0);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const connectIdRef = useRef(0);
  const hiddenAtRef = useRef<number | null>(null);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      const connectId = ++connectIdRef.current;
      if (sharedWs && sharedWs.readyState !== WebSocket.CLOSED) {
        sharedWs.onclose = null;
        sharedWs.close(1000);
        sharedWs = null;
      }

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/status`);
      sharedWs = ws;

      ws.onopen = () => {
        if (!mountedRef.current || connectIdRef.current !== connectId) return;
        retryCountRef.current = 0;
        useTabStore.getState().setStatusWsConnected(true);
      };

      ws.onmessage = (event) => {
        if (!mountedRef.current || connectIdRef.current !== connectId) return;
        try {
          const msg = JSON.parse(event.data) as TStatusServerMessage;

          switch (msg.type) {
            case 'status:sync': {
              useTabStore.getState().syncAllFromServer(msg.tabs);
              for (const [tabId, entry] of Object.entries(msg.tabs)) {
                if (entry.paneTitle && !useTabMetadataStore.getState().metadata[tabId]?.title) {
                  useTabMetadataStore.getState().setTitle(tabId, formatTabTitle(entry.paneTitle));
                }
              }
              break;
            }

            case 'status:update':
              useTabStore.getState().updateFromServer(msg.tabId, {
                cliState: msg.cliState,
                workspaceId: msg.workspaceId,
                tabName: msg.tabName,
                panelType: msg.panelType,
                terminalStatus: msg.terminalStatus,
                listeningPorts: msg.listeningPorts,
                currentProcess: msg.currentProcess,
                agentSummary: msg.agentSummary,
                lastUserMessage: msg.lastUserMessage,
                lastAssistantMessage: msg.lastAssistantMessage,
                currentAction: msg.currentAction,
                readyForReviewAt: msg.readyForReviewAt,
                busySince: msg.busySince,
                dismissedAt: msg.dismissedAt,
                agentSessionId: msg.agentSessionId,
                compactingSince: msg.compactingSince,
                lastEvent: msg.lastEvent,
                eventSeq: msg.eventSeq,
              });
              if (msg.paneTitle) {
                useTabMetadataStore.getState().setTitle(msg.tabId, formatTabTitle(msg.paneTitle));
              }
              break;

            case 'status:hook-event':
              useTabStore.getState().applyHookEvent(msg.tabId, msg.event);
              break;

            case 'rate-limits:update':
              useRateLimitsStore.getState().setData(msg.data);
              break;

            case 'session-history:sync':
              useSessionHistoryStore.getState().syncFromServer(msg.entries);
              break;

            case 'session-history:update':
              useSessionHistoryStore.getState().upsertEntry(msg.entry);
              break;
          }
        } catch {
          // invalid message
        }
      };

      ws.onclose = () => {
        if (!mountedRef.current || connectIdRef.current !== connectId) return;
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

    const markHidden = () => {
      hiddenAtRef.current = Date.now();
    };

    const handleForegroundReconnect = (allowHidden = false) => {
      if (!allowHidden && document.visibilityState === 'hidden') return;
      const state = sharedWs?.readyState;
      const forceReconnect = shouldForceForegroundReconnect(hiddenAtRef.current);
      hiddenAtRef.current = null;
      if (!forceReconnect && (state === WebSocket.OPEN || state === WebSocket.CONNECTING)) return;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      retryCountRef.current = 0;
      connect();
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
      mountedRef.current = false;
      // eslint-disable-next-line react-hooks/exhaustive-deps -- invalidate stale socket callbacks on unmount
      connectIdRef.current++;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (sharedWs) {
        sharedWs.onclose = null;
        sharedWs.close();
        sharedWs = null;
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleForegroundEvent);
      window.removeEventListener('online', handleForegroundEvent);
      window.removeEventListener('pagehide', markHidden);
      window.removeEventListener('pageshow', handlePageShow);
      window.removeEventListener(NATIVE_APP_STATE_EVENT, handleNativeAppState);
    };
  }, []);
};

export default useAgentStatus;
