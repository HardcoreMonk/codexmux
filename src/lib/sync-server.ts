import { WebSocket } from 'ws';
import { createLogger } from '@/lib/logger';

const log = createLogger('sync');

type TSyncEvent =
  | { type: 'workspace' }
  | { type: 'layout'; workspaceId: string }
  | { type: 'config' };

const g = globalThis as unknown as { __ptSyncClients?: Set<WebSocket> };
if (!g.__ptSyncClients) g.__ptSyncClients = new Set();

const clients = g.__ptSyncClients;

export const handleSyncConnection = (ws: WebSocket) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    clients.delete(ws);
  });
};

export const broadcastSync = (event: TSyncEvent) => {
  const msg = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(msg);
    }
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
