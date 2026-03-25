import { WebSocket } from 'ws';

type TSyncEvent =
  | { type: 'workspace' }
  | { type: 'layout'; workspaceId: string };

const g = globalThis as unknown as { __ptSyncClients?: Set<WebSocket> };
if (!g.__ptSyncClients) g.__ptSyncClients = new Set();

const clients = g.__ptSyncClients;

export const handleSyncConnection = (ws: WebSocket) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', (err) => {
    console.log(`[sync-ws] error: ${err.message}`);
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
