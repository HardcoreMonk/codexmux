import { WebSocket } from 'ws';
import type { FSWatcher } from 'fs';
import type { ISessionWatcher } from '@/lib/session-detection';
import type { IAgentProvider } from '@/lib/providers';
import type { IChunkReadResult, TTimelineServerMessage } from '@/types/timeline';

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

export interface ITimelineTailSnapshot {
  maxEntries: number;
  fileSize: number;
  mtimeMs: number;
  result: IChunkReadResult;
  firstTimestamp: string | null;
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
  tailSnapshot?: ITimelineTailSnapshot;
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

export const getTimelinePerfSnapshot = () => {
  const sockets = new Set<WebSocket>();
  let watcherConnections = 0;
  let maxWatcherConnections = 0;
  let processingWatchers = 0;
  let pendingChangeWatchers = 0;
  let cachedTailSnapshots = 0;
  let pendingBufferBytes = 0;

  for (const ws of timelineConnections.keys()) {
    sockets.add(ws);
  }

  for (const fw of fileWatchers.values()) {
    watcherConnections += fw.connections.size;
    maxWatcherConnections = Math.max(maxWatcherConnections, fw.connections.size);
    if (fw.processing) processingWatchers++;
    if (fw.pendingChange) pendingChangeWatchers++;
    if (fw.tailSnapshot) cachedTailSnapshots++;
    pendingBufferBytes += Buffer.byteLength(fw.pendingBuffer, 'utf-8');
    for (const ws of fw.connections) {
      sockets.add(ws);
    }
  }

  let openSockets = 0;
  let totalBufferedAmount = 0;
  let maxBufferedAmount = 0;
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) openSockets++;
    totalBufferedAmount += ws.bufferedAmount;
    maxBufferedAmount = Math.max(maxBufferedAmount, ws.bufferedAmount);
  }

  return {
    connections: timelineConnections.size,
    openSockets,
    fileWatchers: fileWatchers.size,
    sessionWatchers: sessionWatchers.size,
    watcherConnections,
    maxWatcherConnections,
    processingWatchers,
    pendingChangeWatchers,
    cachedTailSnapshots,
    pendingBufferBytes,
    bufferedAmount: {
      total: totalBufferedAmount,
      max: maxBufferedAmount,
    },
  };
};
