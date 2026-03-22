import { WebSocket } from 'ws';
import { getStatusManager } from '@/lib/status-manager';
import type { TStatusClientMessage, IStatusSyncMessage } from '@/types/status';

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

        case 'status:tab-active-report':
          manager.updateTab(msg.tabId, msg.cliState, ws);
          break;

        default:
          console.warn('[status] 알 수 없는 이벤트:', (msg as { type: string }).type);
      }
    } catch {
      // invalid message
    }
  });

  ws.on('close', () => {
    manager.removeClient(ws);
  });

  ws.on('error', () => {
    manager.removeClient(ws);
  });
};

export const gracefulStatusShutdown = () => {
  getStatusManager().shutdown();
};
