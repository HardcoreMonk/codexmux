import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { watch, type FSWatcher } from 'fs';
import { detectSession, watchSessionDir, type ISessionWatcher } from './session-detection';
import { parseSessionFile, parseIncremental } from './session-parser';
import { getWorkspaceById } from './workspace-store';
import type { TTimelineServerMessage } from '@/types/timeline';

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const DEBOUNCE_MS = 50;
const MAX_WATCHERS = 10;
const MAX_WATCHER_RETRIES = 3;

interface ITimelineConnection {
  ws: WebSocket;
  sessionName: string;
  workspaceId: string;
  workspaceDir: string;
  heartbeatTimer: ReturnType<typeof setInterval>;
  lastHeartbeat: number;
  cleaned: boolean;
}

interface IFileWatcher {
  watcher: FSWatcher | null;
  jsonlPath: string;
  offset: number;
  pendingBuffer: string;
  connections: Set<WebSocket>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  retryCount: number;
}

const connections = new Map<WebSocket, ITimelineConnection>();
const fileWatchers = new Map<string, IFileWatcher>();
const sessionWatchers = new Map<string, ISessionWatcher>();

const sendJson = (ws: WebSocket, msg: TTimelineServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

const broadcastToWatcher = (watcherKey: string, msg: TTimelineServerMessage) => {
  const fw = fileWatchers.get(watcherKey);
  if (!fw) return;
  for (const ws of fw.connections) {
    sendJson(ws, msg);
  }
};

const createFileWatcher = (jsonlPath: string): IFileWatcher => {
  const fw: IFileWatcher = {
    watcher: null,
    jsonlPath,
    offset: 0,
    pendingBuffer: '',
    connections: new Set(),
    debounceTimer: null,
    retryCount: 0,
  };

  const startWatch = () => {
    try {
      fw.watcher = watch(jsonlPath, () => {
        if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
        fw.debounceTimer = setTimeout(async () => {
          const { newEntries, newOffset, pendingBuffer } = await parseIncremental(jsonlPath, fw.offset, fw.pendingBuffer);
          fw.pendingBuffer = pendingBuffer;
          if (newEntries.length > 0) {
            fw.offset = newOffset;
            broadcastToWatcher(jsonlPath, { type: 'timeline:append', entries: newEntries });
          }
        }, DEBOUNCE_MS);
      });

      fw.watcher.on('error', () => {
        if (fw.retryCount < MAX_WATCHER_RETRIES) {
          fw.retryCount++;
          if (fw.watcher) fw.watcher.close();
          fw.watcher = null;
          setTimeout(startWatch, 1000);
        }
      });
    } catch {
      // File might not exist yet
    }
  };

  startWatch();
  return fw;
};

const removeFileWatcher = (jsonlPath: string) => {
  const fw = fileWatchers.get(jsonlPath);
  if (!fw) return;
  if (fw.watcher) fw.watcher.close();
  if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
  fileWatchers.delete(jsonlPath);
};

const subscribeToFile = async (ws: WebSocket, jsonlPath: string): Promise<void> => {
  let fw = fileWatchers.get(jsonlPath);
  if (!fw) {
    if (fileWatchers.size >= MAX_WATCHERS) {
      sendJson(ws, { type: 'timeline:error', code: 'max-watchers', message: 'Too many active watchers' });
      return;
    }
    fw = createFileWatcher(jsonlPath);
    fileWatchers.set(jsonlPath, fw);
  }

  fw.connections.add(ws);

  const result = await parseSessionFile(jsonlPath);
  fw.offset = result.lastOffset;

  sendJson(ws, {
    type: 'timeline:init',
    entries: result.entries,
    sessionId: '',
    totalEntries: result.entries.length,
  });
};

const unsubscribeFromFile = (ws: WebSocket, jsonlPath: string) => {
  const fw = fileWatchers.get(jsonlPath);
  if (!fw) return;
  fw.connections.delete(ws);
  if (fw.connections.size === 0) {
    removeFileWatcher(jsonlPath);
  }
};

const cleanup = (conn: ITimelineConnection) => {
  if (conn.cleaned) return;
  conn.cleaned = true;

  clearInterval(conn.heartbeatTimer);
  connections.delete(conn.ws);

  for (const [jsonlPath, fw] of fileWatchers) {
    if (fw.connections.has(conn.ws)) {
      fw.connections.delete(conn.ws);
      if (fw.connections.size === 0) {
        removeFileWatcher(jsonlPath);
      }
    }
  }

  const wsKey = `${conn.workspaceId}:${conn.sessionName}`;
  const sw = sessionWatchers.get(wsKey);
  if (sw) {
    let hasOtherConn = false;
    for (const [, c] of connections) {
      if (c.workspaceId === conn.workspaceId && c.sessionName === conn.sessionName) {
        hasOtherConn = true;
        break;
      }
    }
    if (!hasOtherConn) {
      sw.stop();
      sessionWatchers.delete(wsKey);
    }
  }
};

export const handleTimelineConnection = async (ws: WebSocket, request: IncomingMessage) => {
  const url = new URL(request.url || '', 'http://localhost');
  const sessionName = url.searchParams.get('session') ?? '';
  const workspaceId = url.searchParams.get('workspace') ?? '';

  if (!workspaceId) {
    ws.close(1008, 'Missing workspace parameter');
    return;
  }

  const workspace = await getWorkspaceById(workspaceId);
  if (!workspace) {
    ws.close(1008, 'Workspace not found');
    return;
  }

  const workspaceDir = workspace.directories[0];
  let lastHeartbeat = Date.now();
  let currentJsonlPath: string | null = null;

  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      ws.close(1001, 'Heartbeat timeout');
      return;
    }
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL);

  const conn: ITimelineConnection = {
    ws,
    sessionName,
    workspaceId,
    workspaceDir,
    heartbeatTimer,
    lastHeartbeat,
    cleaned: false,
  };

  connections.set(ws, conn);

  ws.on('pong', () => {
    lastHeartbeat = Date.now();
    conn.lastHeartbeat = lastHeartbeat;
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'timeline:subscribe' && msg.jsonlPath) {
        if (currentJsonlPath) {
          unsubscribeFromFile(ws, currentJsonlPath);
        }
        currentJsonlPath = msg.jsonlPath;
        await subscribeToFile(ws, msg.jsonlPath);
      } else if (msg.type === 'timeline:unsubscribe') {
        if (currentJsonlPath) {
          unsubscribeFromFile(ws, currentJsonlPath);
          currentJsonlPath = null;
        }
      }
    } catch {}
  });

  ws.on('close', () => cleanup(conn));
  ws.on('error', () => cleanup(conn));

  const sessionInfo = await detectSession(workspaceDir);

  if (sessionInfo.jsonlPath) {
    currentJsonlPath = sessionInfo.jsonlPath;
    await subscribeToFile(ws, sessionInfo.jsonlPath);
  } else {
    sendJson(ws, {
      type: 'timeline:init',
      entries: [],
      sessionId: sessionInfo.sessionId ?? '',
      totalEntries: 0,
    });
  }

  const wsKey = `${workspaceId}:${sessionName}`;
  if (!sessionWatchers.has(wsKey)) {
    const sw = watchSessionDir(workspaceDir, async (newInfo) => {
      if (newInfo.jsonlPath && newInfo.jsonlPath !== currentJsonlPath) {
        if (currentJsonlPath) {
          unsubscribeFromFile(ws, currentJsonlPath);
        }
        currentJsonlPath = newInfo.jsonlPath;

        sendJson(ws, {
          type: 'timeline:session-changed',
          newSessionId: newInfo.sessionId ?? '',
          reason: 'new-session-started',
        });

        await subscribeToFile(ws, newInfo.jsonlPath);
      }
    });
    sessionWatchers.set(wsKey, sw);
  }
};

export const gracefulTimelineShutdown = () => {
  for (const [, conn] of connections) {
    if (conn.ws.readyState === WebSocket.OPEN) {
      conn.ws.close(1001, 'Server shutting down');
    }
    cleanup(conn);
  }
  for (const [, sw] of sessionWatchers) {
    sw.stop();
  }
  sessionWatchers.clear();
};
