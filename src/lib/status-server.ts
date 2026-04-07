import { WebSocket } from 'ws';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';
import type { TStatusClientMessage, IStatusSyncMessage } from '@/types/status';

const log = createLogger('status');

export const handleStatusConnection = (ws: WebSocket) => {
  const manager = getStatusManager();
  manager.addClient(ws);

  const syncMsg: IStatusSyncMessage = {
    type: 'status:sync',
    tabs: manager.getAllForClient(),
  };
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(syncMsg));
  }

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw)) as TStatusClientMessage;

      switch (msg.type) {
        case 'status:tab-dismissed':
          manager.dismissTab(msg.tabId, ws);
          break;

        case 'status:cli-state':
          manager.updateTab(msg.tabId, msg.cliState, ws);
          break;

        case 'status:request-sync': {
          const sync: IStatusSyncMessage = {
            type: 'status:sync',
            tabs: manager.getAllForClient(),
          };
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(sync));
          }
          break;
        }

        default:
          log.warn(`Unknown event: ${(msg as { type: string }).type}`);
      }
    } catch {
      // invalid message
    }
  });

  ws.on('close', () => {
    manager.removeClient(ws);
  });

  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    manager.removeClient(ws);
  });
};

export const gracefulStatusShutdown = () => {
  getStatusManager().shutdown();
};
