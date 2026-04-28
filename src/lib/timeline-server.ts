import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { watch, type FSWatcher } from 'fs';
import { existsSync } from 'fs';
import { type ISessionWatcher } from './session-detection';
import { open as fsOpen } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { getSessionPanePid, checkTerminalProcess, sendKeys, getSessionCwd } from './tmux';
import {
  readTabAgentJsonlPath,
  updateTabAgentSessionId,
  updateTabAgentJsonlPath,
  updateTabAgentSummary,
  updateTabLastUserMessage,
  parseSessionName,
} from './layout-store';
import { getStatusManager } from './status-manager';
import { getProviderByPanelType } from '@/lib/providers';
import type { IAgentProvider } from '@/lib/providers';
import { extractSessionIdFromJsonlPath, readSessionStats } from './session-stats';
import type { TTimelineServerMessage, IInitMeta, ITimelineEntry, ISessionStats } from '@/types/timeline';
import path from 'path';
import { isAllowedJsonlPath } from './path-validation';
import { createLogger } from '@/lib/logger';

const log = createLogger('timeline');

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const DEBOUNCE_MS = 50;
const BACKPRESSURE_LIMIT = 1024 * 1024;
const MAX_WATCHERS = 32;
const MAX_CONNECTIONS = 32;
const MAX_WATCHER_RETRIES = 3;
const MAX_INIT_ENTRIES = 64;

const resolveAgentSummary = async (
  _provider: IAgentProvider,
  _sessionName: string,
  jsonlSummary: string | null | undefined,
): Promise<string | null> => {
  return jsonlSummary ?? null;
};

interface ITimelineConnection {
  ws: WebSocket;
  sessionName: string;
  panePid: number;
  provider: IAgentProvider;
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

const connections = gTimeline.__cmuxTimelineConnections;
const fileWatchers = gTimeline.__cmuxTimelineFileWatchers;
const sessionWatchers = gTimeline.__cmuxTimelineSessionWatchers;

const canSend = (ws: WebSocket): boolean =>
  ws.readyState === WebSocket.OPEN && ws.bufferedAmount < BACKPRESSURE_LIMIT;

const sendJson = (ws: WebSocket, msg: TTimelineServerMessage) => {
  if (canSend(ws)) {
    ws.send(JSON.stringify(msg));
  }
};

export const broadcastSessionStats = (stats: ISessionStats) => {
  for (const fw of fileWatchers.values()) {
    if (extractSessionIdFromJsonlPath(fw.jsonlPath) !== stats.sessionId) continue;
    for (const ws of fw.connections) {
      sendJson(ws, { type: 'timeline:stats-update', sessionStats: stats });
    }
  }
};

const sendEmptyInit = (ws: WebSocket, sessionId = '', isAgentStarting = false) => {
  sendJson(ws, {
    type: 'timeline:init',
    entries: [],
    sessionId,
    totalEntries: 0,
    startByteOffset: 0,
    hasMore: false,
    ...(isAgentStarting && { isAgentStarting: true }),
  });
};

const MAX_USER_MESSAGE_LENGTH = 200;

const findLastUserMessage = (entries: ITimelineEntry[]): string | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'user-message' && entry.text.trim()) {
      const text = entry.text.trim();
      return text.length > MAX_USER_MESSAGE_LENGTH
        ? text.slice(0, MAX_USER_MESSAGE_LENGTH) + '…'
        : text;
    }
  }
  return null;
};

const subscribeAndUpdateSummary = async (
  ws: WebSocket,
  jsonlPath: string,
  sessionId: string | undefined,
  sessionName: string,
  provider: IAgentProvider,
) => {
  await updateTabAgentJsonlPath(sessionName, provider, jsonlPath).catch(() => {});
  const jsonlSummary = await subscribeToFile(ws, jsonlPath, sessionId, sessionName, provider);
  const summary = await resolveAgentSummary(provider, sessionName, jsonlSummary);
  await updateTabAgentSummary(sessionName, provider, summary).catch(() => {});
};

const broadcastToWatcher = (watcherKey: string, msg: TTimelineServerMessage) => {
  const fw = fileWatchers.get(watcherKey);
  if (!fw) return;
  const str = JSON.stringify(msg);
  for (const ws of fw.connections) {
    if (canSend(ws)) {
      ws.send(str);
    }
  }
};

const readBoundedEntries = async (
  filePath: string, from: number, to: number, provider: IAgentProvider,
): Promise<import('@/types/timeline').ITimelineEntry[]> => {
  const readSize = to - from;
  if (readSize <= 0) return [];
  const handle = await fsOpen(filePath, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await handle.read(buf, 0, readSize, from);
    return provider.parseJsonlContent(buf.toString('utf-8'));
  } finally {
    await handle.close();
  }
};

const processFileChange = async (fw: IFileWatcher) => {
  if (fw.processing) {
    fw.pendingChange = true;
    return;
  }
  fw.processing = true;
  try {
    const prevOffset = fw.offset;
    const { newEntries, newOffset, pendingBuffer } = await fw.provider.parseIncremental(
      fw.jsonlPath, fw.offset, fw.pendingBuffer,
    );
    fw.pendingBuffer = pendingBuffer;
    if (newEntries.length > 0) {
      fw.offset = newOffset;

      const msg: TTimelineServerMessage = { type: 'timeline:append', entries: newEntries };
      const str = JSON.stringify(msg);
      const partialReads: Promise<void>[] = [];
      for (const ws of fw.connections) {
        if (!canSend(ws)) continue;
        const initOffset = fw.initOffsets.get(ws);
        if (initOffset !== undefined) {
          if (newOffset <= initOffset) {
            continue;
          }
          fw.initOffsets.delete(ws);
          if (prevOffset < initOffset) {
            partialReads.push(
              readBoundedEntries(fw.jsonlPath, initOffset, newOffset, fw.provider)
                .then((entries) => {
                  if (entries.length > 0 && canSend(ws)) {
                    const partialMsg: TTimelineServerMessage = { type: 'timeline:append', entries };
                    ws.send(JSON.stringify(partialMsg));
                  }
                })
                .catch(() => {}),
            );
            continue;
          }
        }
        ws.send(str);
      }
      if (partialReads.length > 0) {
        await Promise.all(partialReads);
      }

      const lastMsg = findLastUserMessage(newEntries);
      if (lastMsg) {
        await updateTabLastUserMessage(fw.sessionName, lastMsg).catch(() => {});
        getStatusManager().notifyLastUserMessage(fw.sessionName, lastMsg);
      }

      if (!fw.summaryResolved && newEntries.some((e) => e.type === 'assistant-message')) {
        fw.summaryResolved = true;
        const summary = await resolveAgentSummary(fw.provider, fw.sessionName, undefined);
        if (summary) {
          await updateTabAgentSummary(fw.sessionName, fw.provider, summary).catch(() => {});
        }
      }
    }
  } finally {
    fw.processing = false;
    if (fw.pendingChange) {
      fw.pendingChange = false;
      processFileChange(fw);
    }
  }
};

const startFileWatch = (fw: IFileWatcher) => {
  try {
    fw.watcher = watch(fw.jsonlPath, () => {
      if (fw.debounceTimer) clearTimeout(fw.debounceTimer);
      fw.debounceTimer = setTimeout(() => processFileChange(fw), DEBOUNCE_MS);
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
          message: 'File watch failed (retries exceeded)',
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

const readFirstTimestamp = async (filePath: string): Promise<string | null> => {
  try {
    const stream = createReadStream(filePath, { encoding: 'utf-8', start: 0, end: 4096 });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.timestamp) {
          rl.close();
          stream.destroy();
          return new Date(obj.timestamp).toISOString();
        }
      } catch { /* skip malformed line */ }
      rl.close();
      stream.destroy();
      break;
    }
  } catch { /* file read error */ }
  return null;
};

const computeInitMeta = (entries: ITimelineEntry[], fileSize: number, createdAtOverride?: string | null, customTitle?: string): IInitMeta => {
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  let lastTimestamp = 0;
  let userCount = 0;
  let assistantCount = 0;

  for (const entry of entries) {
    if (!createdAt && entry.timestamp) {
      createdAt = new Date(entry.timestamp).toISOString();
    }
    if (entry.timestamp) {
      lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
    }
    updatedAt = new Date(entry.timestamp).toISOString();

    if (entry.type === 'user-message') userCount++;
    else if (entry.type === 'assistant-message') assistantCount++;
  }

  return {
    createdAt: createdAtOverride ?? createdAt,
    updatedAt,
    lastTimestamp,
    fileSize,
    userCount,
    assistantCount,
    customTitle,
  };
};

const subscribeToFile = async (
  ws: WebSocket,
  jsonlPath: string,
  sessionId: string | undefined,
  sessionName: string,
  provider: IAgentProvider,
): Promise<string | undefined> => {
  if (!existsSync(jsonlPath)) {
    sendJson(ws, { type: 'timeline:init', entries: [], sessionId: sessionId ?? '', totalEntries: 0, startByteOffset: 0, hasMore: false, jsonlPath });
    return undefined;
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
      sessionName,
      provider,
      summaryResolved: false,
      processing: false,
      pendingChange: false,
      initOffsets: new Map(),
    };
    fileWatchers.set(jsonlPath, fw);
  }

  fw.connections.add(ws);

  const result = await provider.readTailEntries(jsonlPath, MAX_INIT_ENTRIES);

  if (result.errorCount > 0) {
    sendJson(ws, {
      type: 'timeline:error',
      code: 'parse-error',
      message: `JSONL parsing: ${result.errorCount} errors (lines skipped)`,
    });
  }

  if (isNewWatcher) {
    fw.offset = result.fileSize;
    startFileWatch(fw);
  }

  const firstTimestamp = result.hasMore ? await readFirstTimestamp(jsonlPath) : null;
  const meta = computeInitMeta(result.entries, result.fileSize, firstTimestamp, result.customTitle);

  const resolvedSessionId = sessionId ?? extractSessionIdFromJsonlPath(jsonlPath) ?? '';
  const sessionStats = resolvedSessionId ? await readSessionStats(resolvedSessionId) : null;

  sendJson(ws, {
    type: 'timeline:init',
    entries: result.entries,
    sessionId: resolvedSessionId,
    totalEntries: result.entries.length,
    startByteOffset: result.startByteOffset,
    hasMore: result.hasMore,
    jsonlPath,
    summary: result.summary,
    meta,
    sessionStats,
  });

  if (!isNewWatcher) {
    fw.initOffsets.set(ws, result.fileSize);
  }

  if (sessionName) {
    const lastMsg = findLastUserMessage(result.entries);
    if (lastMsg) {
      await updateTabLastUserMessage(sessionName, lastMsg).catch(() => {});
      getStatusManager().notifyLastUserMessage(sessionName, lastMsg);
    }
  }

  return result.summary;
};

const unsubscribeFromFile = (ws: WebSocket, jsonlPath: string) => {
  const fw = fileWatchers.get(jsonlPath);
  if (!fw) return;
  fw.connections.delete(ws);
  fw.initOffsets.delete(ws);
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
  provider: IAgentProvider,
  tmuxSession: string,
  sessionId: string,
): Promise<string | null> => {
  const cwd = await getSessionCwd(tmuxSession);
  if (!cwd) return null;
  const jsonlPath = await provider.resolveJsonlPath(sessionId, cwd);
  if (!jsonlPath) return null;
  return existsSync(jsonlPath) ? jsonlPath : null;
};

const resolveCachedJsonlPath = async (
  sessionName: string,
  provider: IAgentProvider,
): Promise<string | null> => {
  const cached = await readTabAgentJsonlPath(sessionName, provider);
  if (!cached || !isAllowedJsonlPath(cached) || !existsSync(cached)) return null;
  return cached;
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

    const parsed = parseSessionName(tmuxSession);
    const resumeCmd = await conn.provider.buildResumeCommand(sessionId, { workspaceId: parsed?.wsId });
    await sendKeys(tmuxSession, resumeCmd);

    await updateTabAgentSessionId(conn.sessionName, conn.provider, sessionId).catch(() => {});

    const jsonlPath = await resolveJsonlPath(conn.provider, tmuxSession, sessionId);

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
      await subscribeAndUpdateSummary(ws, jsonlPath, sessionId, conn.sessionName, conn.provider);
    } else {
      sendEmptyInit(ws, sessionId);
    }
  } catch (err) {
    sendJson(ws, {
      type: 'timeline:resume-error',
      message: err instanceof Error ? err.message : 'Error during resume',
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

  const panelType = url.searchParams.get('panelType') ?? 'codex';
  const provider = getProviderByPanelType(panelType);
  if (!provider) {
    ws.close(1008, 'Unknown panel type');
    return;
  }

  const panePid = await getSessionPanePid(sessionName);
  if (!panePid) {
    sendEmptyInit(ws);
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
    provider,
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
        if (!isAllowedJsonlPath(msg.jsonlPath)) {
          sendJson(ws, { type: 'timeline:error', code: 'forbidden-path', message: 'Not allowed path' });
          return;
        }
        if (conn.currentJsonlPath) {
          unsubscribeFromFile(ws, conn.currentJsonlPath);
        }
        conn.currentJsonlPath = msg.jsonlPath;
        await subscribeToFile(ws, msg.jsonlPath, undefined, conn.sessionName, conn.provider);
      } else if (msg.type === 'timeline:unsubscribe') {
        if (conn.currentJsonlPath) {
          unsubscribeFromFile(ws, conn.currentJsonlPath);
          conn.currentJsonlPath = null;
        }
      } else if (msg.type === 'timeline:resume' && msg.sessionId && msg.tmuxSession) {
        if (!conn.provider.isValidSessionId(msg.sessionId)) {
          sendJson(ws, { type: 'timeline:resume-error', message: 'Invalid session ID format' });
        } else {
          await handleResumeMessage(ws, conn, {
            sessionId: msg.sessionId,
            tmuxSession: msg.tmuxSession,
          });
        }
      }
    } catch (err) {
      log.error(`message handler error: ${err instanceof Error ? err.message : err}`);
    }
  });

  ws.on('close', () => cleanup(conn));
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    cleanup(conn);
  });

  const hintSessionId = url.searchParams.get('agentSessionId');
  const sessionInfo = await provider.detectActiveSession(panePid);

  if (conn.cleaned) return;

  if (sessionInfo.status === 'not-installed') {
    sendJson(ws, { type: 'timeline:error', code: 'not-installed', message: `${provider.displayName} is not installed` });
    sendEmptyInit(ws);
    return;
  }

  // Check if agent process is running in pane before PID file is created
  const isAgentStarting = sessionInfo.status === 'not-running'
    && !hintSessionId
    && await provider.isAgentRunning(panePid);

  if (sessionInfo.status === 'running' && sessionInfo.sessionId) {
    sendJson(ws, {
      type: 'timeline:session-changed',
      newSessionId: sessionInfo.sessionId,
      reason: 'session-waiting',
    });
  } else if (isAgentStarting) {
    sendJson(ws, {
      type: 'timeline:session-changed',
      newSessionId: '',
      reason: 'session-waiting',
    });
  }

  const effectiveSessionId = sessionInfo.sessionId ?? hintSessionId;

  if (sessionInfo.jsonlPath) {
    conn.currentJsonlPath = sessionInfo.jsonlPath;
    if (sessionInfo.sessionId) {
      await updateTabAgentSessionId(conn.sessionName, provider, sessionInfo.sessionId).catch(() => {});
    }
    await subscribeAndUpdateSummary(ws, sessionInfo.jsonlPath, sessionInfo.sessionId ?? undefined, conn.sessionName, provider);
  } else if (effectiveSessionId) {
    if (sessionInfo.sessionId) {
      await updateTabAgentSessionId(conn.sessionName, provider, sessionInfo.sessionId).catch(() => {});
    }
    const jsonlPath = await resolveCachedJsonlPath(conn.sessionName, provider)
      ?? await resolveJsonlPath(provider, sessionName, effectiveSessionId);
    if (jsonlPath) {
      conn.currentJsonlPath = jsonlPath;
      await subscribeAndUpdateSummary(ws, jsonlPath, effectiveSessionId, conn.sessionName, provider);
    } else {
      sendEmptyInit(ws, effectiveSessionId);
    }
  } else if (!isAgentStarting) {
    sendEmptyInit(ws);
  }

  if (conn.cleaned) return;

  // Watch for new sessions — shared per session key
  const wsKey = sessionName;
  if (!sessionWatchers.has(wsKey)) {
    const sw = provider.watchSessions(panePid, async (newInfo) => {
      const wsConns = getSessionConnections(sessionName);
      for (const c of wsConns) {
        if (newInfo.jsonlPath && newInfo.jsonlPath !== c.currentJsonlPath) {
      if (c.currentJsonlPath) {
            unsubscribeFromFile(c.ws, c.currentJsonlPath);
          }
          c.currentJsonlPath = newInfo.jsonlPath;

          if (newInfo.sessionId) {
            await updateTabAgentSessionId(sessionName, provider, newInfo.sessionId).catch(() => {});
          }

          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: newInfo.sessionId ?? '',
            reason: 'new-session-started',
          });

          await subscribeAndUpdateSummary(c.ws, newInfo.jsonlPath, newInfo.sessionId ?? undefined, sessionName, provider);
        } else if (!newInfo.jsonlPath && newInfo.status === 'not-running') {
          if (c.currentJsonlPath) {
            unsubscribeFromFile(c.ws, c.currentJsonlPath);
            c.currentJsonlPath = null;
          }
          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: '',
            reason: 'session-ended',
          });
        }
      }

      if (newInfo.status === 'running' && !newInfo.jsonlPath) {
        if (newInfo.sessionId) {
          await updateTabAgentSessionId(sessionName, provider, newInfo.sessionId).catch(() => {});
        }
        for (const c of wsConns) {
          if (c.currentJsonlPath) {
            const currentFile = path.basename(c.currentJsonlPath, '.jsonl');
            if (newInfo.sessionId && currentFile !== newInfo.sessionId) {
              unsubscribeFromFile(c.ws, c.currentJsonlPath);
              c.currentJsonlPath = null;
            } else {
              continue;
            }
          }
          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: newInfo.sessionId ?? '',
            reason: 'session-waiting',
          });
        }
      }
    }, { skipInitial: true });
    sessionWatchers.set(wsKey, sw);
  }

  // Race condition mitigation for isAgentStarting:
  // If PID file is created between detectActiveSession and isAgentRunning,
  // initial detection misses it and watchSessions won't fire for an existing file.
  // Re-check after watcher setup to cover this gap.
  if (isAgentStarting) {
    const recheckInfo = await provider.detectActiveSession(panePid);
    if (conn.cleaned) return;

    if (recheckInfo.status === 'running' && recheckInfo.sessionId && !conn.currentJsonlPath) {
      await updateTabAgentSessionId(sessionName, provider, recheckInfo.sessionId).catch(() => {});

      if (recheckInfo.jsonlPath) {
        conn.currentJsonlPath = recheckInfo.jsonlPath;
        sendJson(ws, {
          type: 'timeline:session-changed',
          newSessionId: recheckInfo.sessionId,
          reason: 'new-session-started',
        });
        await subscribeAndUpdateSummary(ws, recheckInfo.jsonlPath, recheckInfo.sessionId, sessionName, provider);
      } else if (recheckInfo.cwd) {
        sendJson(ws, {
          type: 'timeline:session-changed',
          newSessionId: recheckInfo.sessionId,
          reason: 'session-waiting',
        });
        sendEmptyInit(ws, recheckInfo.sessionId, true);
      }
    } else {
      sendEmptyInit(ws, '', true);
    }
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
