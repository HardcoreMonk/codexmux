import { WebSocket } from 'ws';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('agent-status');

export const handleAgentStatusConnection = (ws: WebSocket) => {
  const manager = getAgentManager();
  manager.addClient(ws);

  const syncMsg = manager.getAllForSync();
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(syncMsg));
  }

  ws.on('close', () => {
    manager.removeClient(ws);
  });

  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    manager.removeClient(ws);
  });
};

export const gracefulAgentStatusShutdown = () => {
  getAgentManager().shutdown();
};
