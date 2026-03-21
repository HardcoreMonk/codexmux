import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { watch, type FSWatcher } from 'fs';
import { existsSync } from 'fs';
import { detectActiveSession, watchSessionsDir, type ISessionWatcher } from './session-detection';
import { parseSessionFile, parseIncremental } from './session-parser';
import { getSessionPanePid, checkTerminalProcess, sendKeys, getSessionCwd } from './tmux';
import { cwdToProjectPath } from './session-list';
import { updateTabClaudeSessionId } from './layout-store';
import type { TTimelineServerMessage } from '@/types/timeline';
import path from 'path';

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const DEBOUNCE_MS = 50;
const MAX_WATCHERS = 10;
const MAX_CONNECTIONS = 30;
const MAX_WATCHER_RETRIES = 3;
const MAX_INIT_ENTRIES = 200;

interface ITimelineConnection {
  ws: WebSocket;
  sessionName: string;
  panePid: number;
  heartbeatTimer: ReturnType<typeof setInterval>;
  lastHeartbeat: number;
  currentJsonlPath: string | null;
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

const startFileWatch = (fw: IFileWatcher) => {
  try {
    fw.watcher = watch(fw.jsonlPath, () => {
      if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
      fw.debounceTimer = setTimeout(async () => {
        const { newEntries, newOffset, pendingBuffer } = await parseIncremental(
          fw.jsonlPath, fw.offset, fw.pendingBuffer,
        );
        fw.pendingBuffer = pendingBuffer;
        if (newEntries.length > 0) {
          fw.offset = newOffset;
          broadcastToWatcher(fw.jsonlPath, { type: 'timeline:append', entries: newEntries });
        }
      }, DEBOUNCE_MS);
    });

    fw.watcher.on('error', () => {
      if (fw.retryCount < MAX_WATCHER_RETRIES) {
        fw.retryCount++;
        if (fw.watcher) fw.watcher.close();
        fw.watcher = null;
        setTimeout(() => startFileWatch(fw), 1000);
      } else {
        broadcastToWatcher(fw.jsonlPath, {
          type: 'timeline:error',
          code: 'watcher-failed',
          message: '파일 감시 실패 (재시도 초과)',
        });
      }
    });
  } catch {
    // File might not exist yet
  }
};

const removeFileWatcher = (jsonlPath: string) => {
  const fw = fileWatchers.get(jsonlPath);
  if (!fw) return;
  if (fw.watcher) fw.watcher.close();
  if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
  fileWatchers.delete(jsonlPath);
};

const subscribeToFile = async (ws: WebSocket, jsonlPath: string, sessionId?: string): Promise<void> => {
  if (!existsSync(jsonlPath)) {
    sendJson(ws, { type: 'timeline:error', code: 'file-not-found', message: 'JSONL 파일을 찾을 수 없습니다' });
    return;
  }

  let fw = fileWatchers.get(jsonlPath);
  const isNewWatcher = !fw;

  if (!fw) {
    if (fileWatchers.size >= MAX_WATCHERS) {
      sendJson(ws, { type: 'timeline:error', code: 'max-watchers', message: 'Too many active watchers' });
      return;
    }
    fw = {
      watcher: null,
      jsonlPath,
      offset: 0,
      pendingBuffer: '',
      connections: new Set(),
      debounceTimer: null,
      retryCount: 0,
    };
    fileWatchers.set(jsonlPath, fw);
  }

  fw.connections.add(ws);

  const result = await parseSessionFile(jsonlPath);

  if (result.errorCount > 0) {
    sendJson(ws, {
      type: 'timeline:error',
      code: 'parse-error',
      message: `JSONL 파싱 중 ${result.errorCount}건의 오류 발생 (해당 줄 무시됨)`,
    });
  }

  // Only set offset and start watcher for new file watchers — avoids
  // overwriting the offset when a second client subscribes to the same file
  if (isNewWatcher) {
    fw.offset = result.lastOffset;
    startFileWatch(fw);
  }

  // Limit init entries for large files (spec: 200 max for 1MB+ files)
  const entries = result.entries.length > MAX_INIT_ENTRIES
    ? result.entries.slice(-MAX_INIT_ENTRIES)
    : result.entries;

  sendJson(ws, {
    type: 'timeline:init',
    entries,
    sessionId: sessionId ?? '',
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

const getSessionConnections = (sessionName: string): ITimelineConnection[] => {
  const result: ITimelineConnection[] = [];
  for (const [, conn] of connections) {
    if (conn.sessionName === sessionName) {
      result.push(conn);
    }
  }
  return result;
};

const cleanup = (conn: ITimelineConnection) => {
  if (conn.cleaned) return;
  conn.cleaned = true;

  clearInterval(conn.heartbeatTimer);
  connections.delete(conn.ws);

  if (conn.currentJsonlPath) {
    unsubscribeFromFile(conn.ws, conn.currentJsonlPath);
  }

  const wsKey = conn.sessionName;
  const hasOtherConn = getSessionConnections(conn.sessionName).length > 0;
  if (!hasOtherConn) {
    const sw = sessionWatchers.get(wsKey);
    if (sw) {
      sw.stop();
      sessionWatchers.delete(wsKey);
    }
  }
};

const resolveJsonlPath = async (
  tmuxSession: string,
  sessionId: string,
): Promise<string | null> => {
  const cwd = await getSessionCwd(tmuxSession);
  if (!cwd) return null;
  const projectDir = cwdToProjectPath(cwd);
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
  return existsSync(jsonlPath) ? jsonlPath : null;
};

const handleResumeMessage = async (
  ws: WebSocket,
  conn: ITimelineConnection,
  payload: { sessionId: string; tmuxSession: string },
) => {
  const { sessionId, tmuxSession } = payload;

  try {
    const { isSafe, processName } = await checkTerminalProcess(tmuxSession);

    if (!isSafe) {
      sendJson(ws, {
        type: 'timeline:resume-blocked',
        reason: 'process-running',
        processName,
      });
      return;
    }

    await sendKeys(tmuxSession, `claude --resume ${sessionId}`);

    await updateTabClaudeSessionId(conn.sessionName, sessionId).catch(() => {});

    const jsonlPath = await resolveJsonlPath(tmuxSession, sessionId);

    sendJson(ws, {
      type: 'timeline:resume-started',
      sessionId,
      jsonlPath,
    });

    if (jsonlPath) {
      if (conn.currentJsonlPath) {
        unsubscribeFromFile(ws, conn.currentJsonlPath);
      }
      conn.currentJsonlPath = jsonlPath;
      await subscribeToFile(ws, jsonlPath, sessionId);
    }
  } catch (err) {
    sendJson(ws, {
      type: 'timeline:resume-error',
      message: err instanceof Error ? err.message : 'resume 실행 중 오류가 발생했습니다',
    });
  }
};

export const handleTimelineConnection = async (ws: WebSocket, request: IncomingMessage) => {
  if (connections.size >= MAX_CONNECTIONS) {
    ws.close(1013, 'Too many connections');
    return;
  }

  const url = new URL(request.url || '', 'http://localhost');
  const sessionName = url.searchParams.get('session') ?? '';

  if (!sessionName) {
    ws.close(1008, 'Missing session parameter');
    return;
  }

  const panePid = await getSessionPanePid(sessionName);
  if (!panePid) {
    sendJson(ws, { type: 'timeline:init', entries: [], sessionId: '', totalEntries: 0 });
    ws.close(1000, 'Cannot resolve pane pid');
    return;
  }

  let lastHeartbeat = Date.now();

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
    panePid,
    heartbeatTimer,
    lastHeartbeat,
    currentJsonlPath: null,
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
        if (conn.currentJsonlPath) {
          unsubscribeFromFile(ws, conn.currentJsonlPath);
        }
        conn.currentJsonlPath = msg.jsonlPath;
        await subscribeToFile(ws, msg.jsonlPath);
      } else if (msg.type === 'timeline:unsubscribe') {
        if (conn.currentJsonlPath) {
          unsubscribeFromFile(ws, conn.currentJsonlPath);
          conn.currentJsonlPath = null;
        }
      } else if (msg.type === 'timeline:resume' && msg.sessionId && msg.tmuxSession) {
        await handleResumeMessage(ws, conn, {
          sessionId: msg.sessionId,
          tmuxSession: msg.tmuxSession,
        });
      }
    } catch {}
  });

  ws.on('close', () => cleanup(conn));
  ws.on('error', () => cleanup(conn));

  const sessionInfo = await detectActiveSession(panePid);

  if (sessionInfo.jsonlPath) {
    conn.currentJsonlPath = sessionInfo.jsonlPath;
    await subscribeToFile(ws, sessionInfo.jsonlPath, sessionInfo.sessionId ?? undefined);

    if (sessionInfo.sessionId) {
      await updateTabClaudeSessionId(conn.sessionName, sessionInfo.sessionId).catch(() => {});
    }
  } else {
    sendJson(ws, {
      type: 'timeline:init',
      entries: [],
      sessionId: sessionInfo.sessionId ?? '',
      totalEntries: 0,
    });
  }

  // Watch for new sessions — shared per session key
  const wsKey = sessionName;
  if (!sessionWatchers.has(wsKey)) {
    const sw = watchSessionsDir(panePid, async (newInfo) => {
      if (newInfo.sessionId) {
        await updateTabClaudeSessionId(sessionName, newInfo.sessionId).catch(() => {});
      }

      const wsConns = getSessionConnections(sessionName);
      for (const c of wsConns) {
        if (newInfo.jsonlPath && newInfo.jsonlPath !== c.currentJsonlPath) {
          if (c.currentJsonlPath) {
            unsubscribeFromFile(c.ws, c.currentJsonlPath);
          }
          c.currentJsonlPath = newInfo.jsonlPath;

          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: newInfo.sessionId ?? '',
            reason: 'new-session-started',
          });

          await subscribeToFile(c.ws, newInfo.jsonlPath, newInfo.sessionId ?? undefined);
        }
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
  for (const [jsonlPath] of fileWatchers) {
    removeFileWatcher(jsonlPath);
  }
};
