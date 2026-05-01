import { WebSocket } from 'ws';
import { createLogger } from '@/lib/logger';
import { recordPerfCounter } from '@/lib/perf-metrics';

const log = createLogger('sync');

type TSyncEvent =
  | { type: 'workspace' }
  | { type: 'layout'; workspaceId: string }
  | { type: 'config' };

const g = globalThis as unknown as { __ptSyncClients?: Set<WebSocket> };
if (!g.__ptSyncClients) g.__ptSyncClients = new Set();

const clients = g.__ptSyncClients;

export const getSyncPerfSnapshot = () => {
  let openClients = 0;
  let totalBufferedAmount = 0;
  let maxBufferedAmount = 0;

  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) openClients++;
    totalBufferedAmount += ws.bufferedAmount;
    maxBufferedAmount = Math.max(maxBufferedAmount, ws.bufferedAmount);
  }

  return {
    clients: clients.size,
    openClients,
    bufferedAmount: {
      total: totalBufferedAmount,
      max: maxBufferedAmount,
    },
  };
};

export const handleSyncConnection = (ws: WebSocket) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    clients.delete(ws);
  });
};

const BACKPRESSURE_LIMIT = 1024 * 1024;

export const broadcastSync = (event: TSyncEvent) => {
  const msg = JSON.stringify(event);
  let sent = 0;
  let skippedBackpressure = 0;
  for (const ws of clients) {
    if (ws.readyState !== WebSocket.OPEN) continue;
    if (ws.bufferedAmount >= BACKPRESSURE_LIMIT) {
      skippedBackpressure++;
      continue;
    }
    ws.send(msg);
    sent++;
  }
  if (sent > 0) recordPerfCounter('sync.ws.sent', sent);
  if (skippedBackpressure > 0) {
    recordPerfCounter('sync.ws.backpressure_skipped', skippedBackpressure);
  }
};

export const gracefulSyncShutdown = () => {
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1001, 'Server shutting down');
    }
  }
  clients.clear();
};
