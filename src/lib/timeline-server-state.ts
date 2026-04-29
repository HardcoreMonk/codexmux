import { WebSocket } from 'ws';
import type { FSWatcher } from 'fs';
import type { ISessionWatcher } from '@/lib/session-detection';
import type { IAgentProvider } from '@/lib/providers';
import type { TTimelineServerMessage } from '@/types/timeline';

const BACKPRESSURE_LIMIT = 1024 * 1024;

export interface ITimelineConnection {
  ws: WebSocket;
  sessionName: string;
  panePid: number;
  provider: IAgentProvider;
  heartbeatTimer: ReturnType<typeof setInterval>;
  lastHeartbeat: number;
  currentJsonlPath: string | null;
  cleaned: boolean;
}

export interface IFileWatcher {
  watcher: FSWatcher | null;
  jsonlPath: string;
  offset: number;
  pendingBuffer: string;
  connections: Set<WebSocket>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryCount: number;
  sessionName: string;
  provider: IAgentProvider;
  summaryResolved: boolean;
  processing: boolean;
  pendingChange: boolean;
  initOffsets: Map<WebSocket, number>;
}

const gTimeline = globalThis as unknown as {
  __cmuxTimelineConnections?: Map<WebSocket, ITimelineConnection>;
  __cmuxTimelineFileWatchers?: Map<string, IFileWatcher>;
  __cmuxTimelineSessionWatchers?: Map<string, ISessionWatcher>;
};

if (!gTimeline.__cmuxTimelineConnections) gTimeline.__cmuxTimelineConnections = new Map();
if (!gTimeline.__cmuxTimelineFileWatchers) gTimeline.__cmuxTimelineFileWatchers = new Map();
if (!gTimeline.__cmuxTimelineSessionWatchers) gTimeline.__cmuxTimelineSessionWatchers = new Map();

export const timelineConnections = gTimeline.__cmuxTimelineConnections;
export const fileWatchers = gTimeline.__cmuxTimelineFileWatchers;
export const sessionWatchers = gTimeline.__cmuxTimelineSessionWatchers;

export const canSendTimelineMessage = (ws: WebSocket): boolean =>
  ws.readyState === WebSocket.OPEN && ws.bufferedAmount < BACKPRESSURE_LIMIT;

export const sendTimelineJson = (ws: WebSocket, msg: TTimelineServerMessage): void => {
  if (canSendTimelineMessage(ws)) {
    ws.send(JSON.stringify(msg));
  }
};

export const broadcastTimelineWatcher = (
  watcherKey: string,
  msg: TTimelineServerMessage,
): void => {
  const fw = fileWatchers.get(watcherKey);
  if (!fw) return;
  const str = JSON.stringify(msg);
  for (const ws of fw.connections) {
    if (canSendTimelineMessage(ws)) {
      ws.send(str);
    }
  }
};
