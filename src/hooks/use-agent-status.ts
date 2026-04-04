import { useEffect, useRef } from 'react';
import useAgentStore from '@/hooks/use-agent-store';
import type { TAgentServerMessage } from '@/types/agent';

const RECONNECT_DELAY = 3000;
const MAX_RETRIES = 5;

const useAgentStatus = () => {
  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);
  const retriesRef = useRef(0);

  useEffect(() => {
    mountedRef.current = true;

    const connect = () => {
      if (!mountedRef.current) return;
      if (retriesRef.current >= MAX_RETRIES) return;

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${location.host}/api/agent-status`);
      wsRef.current = ws;

      ws.onopen = () => {
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data: TAgentServerMessage = JSON.parse(event.data);
          const store = useAgentStore.getState();

          if (data.type === 'agent:sync') {
            store.syncFromServer(data.agents);
          }

          if (data.type === 'agent:status') {
            store.updateStatus(data.agentId, data.status);
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (mountedRef.current) {
          retriesRef.current += 1;
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

export default useAgentStatus;
