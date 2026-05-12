import type { WebSocket } from 'ws';

import type { IFileWatcher } from '@/lib/timeline-server-state';
import type { ISessionStats, TTimelineServerMessage } from '@/types/timeline';

interface ICreateTimelineSubscriptionDeliveryOptions {
  fileWatchers: Map<string, IFileWatcher>;
  canSend: (ws: WebSocket) => boolean;
  getSessionIdFromJsonlPath?: (jsonlPath: string) => string | null;
}

export const createTimelineSubscriptionDelivery = ({
  fileWatchers,
  canSend,
  getSessionIdFromJsonlPath,
}: ICreateTimelineSubscriptionDeliveryOptions) => {
  const send = (ws: WebSocket, message: TTimelineServerMessage): boolean => {
    if (!canSend(ws)) return false;
    ws.send(JSON.stringify(message));
    return true;
  };

  const broadcastConnections = (connections: Set<WebSocket>, message: TTimelineServerMessage): number => {
    let count = 0;
    for (const ws of connections) {
      if (send(ws, message)) count++;
    }
    return count;
  };

  const broadcastWatcher = (jsonlPath: string, message: TTimelineServerMessage): number => {
    const fw = fileWatchers.get(jsonlPath);
    if (!fw) return 0;
    return broadcastConnections(fw.connections, message);
  };

  const broadcastSessionStats = (stats: ISessionStats): number => {
    if (!getSessionIdFromJsonlPath) return 0;
    const message: TTimelineServerMessage = {
      type: 'timeline:stats-update',
      sessionStats: stats,
    };
    let count = 0;
    for (const fw of fileWatchers.values()) {
      if (getSessionIdFromJsonlPath(fw.jsonlPath) !== stats.sessionId) continue;
      count += broadcastConnections(fw.connections, message);
    }
    return count;
  };

  return {
    send,
    broadcastWatcher,
    broadcastSessionStats,
  };
};
