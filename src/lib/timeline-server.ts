import { IncomingMessage } from 'http';
import { WebSocket } from 'ws';
import { watch, type FSWatcher } from 'fs';
import { existsSync } from 'fs';
import { detectActiveSession, isClaudeRunning, watchSessionsDir, type ISessionWatcher } from './session-detection';
import { readTailEntries, parseIncremental, parseJsonlContent } from './session-parser';
import { open as fsOpen } from 'fs/promises';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { getSessionPanePid, checkTerminalProcess, sendKeys, getSessionCwd, getPaneTitle } from './tmux';
import { cwdToProjectPath } from './session-list';
import { updateTabClaudeSessionId, updateTabClaudeSummary, updateTabLastUserMessage } from './layout-store';
import { getDangerouslySkipPermissions } from './config-store';
import { HOOK_SETTINGS_PATH } from './hook-settings';
import { calculateCost } from './format-tokens';
import type { TTimelineServerMessage, IInitMeta, ITimelineEntry } from '@/types/timeline';
import path from 'path';
import { isAllowedJsonlPath } from './path-validation';
import { createLogger } from '@/lib/logger';

const log = createLogger('timeline');

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;
const DEBOUNCE_MS = 50;
const MAX_WATCHERS = 32;
const MAX_CONNECTIONS = 32;
const MAX_WATCHER_RETRIES = 3;
const MAX_INIT_ENTRIES = 64;

const CLAUDE_TITLE_RE = /^[✳⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏⠐⠈]\s+/;

const parseClaudePaneTitle = (paneTitle: string | null): string | null => {
  if (!paneTitle) return null;
  if (!CLAUDE_TITLE_RE.test(paneTitle)) return null;
  const cleaned = paneTitle.replace(CLAUDE_TITLE_RE, '').trim();
  return cleaned || null;
};

const resolveClaudeSummary = async (
  sessionName: string,
  jsonlSummary: string | null | undefined,
): Promise<string | null> => {
  const paneTitle = await getPaneTitle(sessionName);
  return parseClaudePaneTitle(paneTitle) ?? jsonlSummary ?? null;
};

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
  sessionName: string | null;
  summaryResolved: boolean;
  processing: boolean;
  pendingChange: boolean;
  initOffsets: Map<WebSocket, number>;
}

const connections = new Map<WebSocket, ITimelineConnection>();
const fileWatchers = new Map<string, IFileWatcher>();
const sessionWatchers = new Map<string, ISessionWatcher>();

interface IJsonlWatcher {
  stop: () => void;
}
const pendingJsonlWatchers = new Map<string, IJsonlWatcher>();

const sendJson = (ws: WebSocket, msg: TTimelineServerMessage) => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

const sendEmptyInit = (ws: WebSocket, sessionId = '') => {
  sendJson(ws, {
    type: 'timeline:init',
    entries: [],
    sessionId,
    totalEntries: 0,
    startByteOffset: 0,
    hasMore: false,
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
  ws: WebSocket, jsonlPath: string, sessionId: string | undefined, sessionName: string,
) => {
  const jsonlSummary = await subscribeToFile(ws, jsonlPath, sessionId, sessionName);
  const summary = await resolveClaudeSummary(sessionName, jsonlSummary);
  await updateTabClaudeSummary(sessionName, summary).catch(() => {});
};

const broadcastToWatcher = (watcherKey: string, msg: TTimelineServerMessage) => {
  const fw = fileWatchers.get(watcherKey);
  if (!fw) return;
  const str = JSON.stringify(msg);
  for (const ws of fw.connections) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(str);
    }
  }
};

const readBoundedEntries = async (
  filePath: string, from: number, to: number,
): Promise<import('@/types/timeline').ITimelineEntry[]> => {
  const readSize = to - from;
  if (readSize <= 0) return [];
  const handle = await fsOpen(filePath, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await handle.read(buf, 0, readSize, from);
    return parseJsonlContent(buf.toString('utf-8'));
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
    const { newEntries, newOffset, pendingBuffer } = await parseIncremental(
      fw.jsonlPath, fw.offset, fw.pendingBuffer,
    );
    fw.pendingBuffer = pendingBuffer;
    if (newEntries.length > 0) {
      fw.offset = newOffset;

      const msg: TTimelineServerMessage = { type: 'timeline:append', entries: newEntries };
      const str = JSON.stringify(msg);
      const partialReads: Promise<void>[] = [];
      for (const ws of fw.connections) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        const initOffset = fw.initOffsets.get(ws);
        if (initOffset !== undefined) {
          if (newOffset <= initOffset) {
            continue;
          }
          fw.initOffsets.delete(ws);
          if (prevOffset < initOffset) {
            partialReads.push(
              readBoundedEntries(fw.jsonlPath, initOffset, newOffset)
                .then((entries) => {
                  if (entries.length > 0 && ws.readyState === WebSocket.OPEN) {
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

      if (fw.sessionName) {
        const lastMsg = findLastUserMessage(newEntries);
        if (lastMsg) {
          await updateTabLastUserMessage(fw.sessionName, lastMsg).catch(() => {});
        }
      }

      if (!fw.summaryResolved && fw.sessionName && newEntries.some((e) => e.type === 'assistant-message')) {
        fw.summaryResolved = true;
        const summary = await resolveClaudeSummary(fw.sessionName, undefined);
        if (summary) {
          await updateTabClaudeSummary(fw.sessionName, summary).catch(() => {});
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
  let inputTokens = 0;
  let outputTokens = 0;
  const modelMap = new Map<string, {
    inputTokens: number;
    outputTokens: number;
    cacheCreationTokens: number;
    cacheReadTokens: number;
  }>();

  for (const entry of entries) {
    if (!createdAt && entry.timestamp) {
      createdAt = new Date(entry.timestamp).toISOString();
    }
    if (entry.timestamp) {
      lastTimestamp = Math.max(lastTimestamp, entry.timestamp);
    }
    updatedAt = new Date(entry.timestamp).toISOString();

    if (entry.type === 'user-message') {
      userCount++;
    } else if (entry.type === 'assistant-message') {
      assistantCount++;
      if (entry.usage) {
        const cacheCreation = entry.usage.cache_creation_input_tokens ?? 0;
        const cacheRead = entry.usage.cache_read_input_tokens ?? 0;
        inputTokens += entry.usage.input_tokens + cacheCreation + cacheRead;
        outputTokens += entry.usage.output_tokens;

        const model = entry.model ?? 'unknown';
        const existing = modelMap.get(model) ?? {
          inputTokens: 0, outputTokens: 0, cacheCreationTokens: 0, cacheReadTokens: 0,
        };
        existing.inputTokens += entry.usage.input_tokens;
        existing.outputTokens += entry.usage.output_tokens;
        existing.cacheCreationTokens += cacheCreation;
        existing.cacheReadTokens += cacheRead;
        modelMap.set(model, existing);
      }
    }
  }

  const tokensByModel = Array.from(modelMap.entries())
    .map(([model, tokens]) => ({
      model,
      inputTokens: tokens.inputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens,
      outputTokens: tokens.outputTokens,
      totalTokens: tokens.inputTokens + tokens.cacheCreationTokens + tokens.cacheReadTokens + tokens.outputTokens,
      cost: calculateCost(model, tokens.inputTokens, tokens.outputTokens, tokens.cacheCreationTokens, tokens.cacheReadTokens),
    }))
    .sort((a, b) => b.totalTokens - a.totalTokens);

  const totalCost = tokensByModel.reduce<number | null>((sum, m) => {
    if (m.cost === null) return sum;
    return (sum ?? 0) + m.cost;
  }, null);

  return {
    createdAt: createdAtOverride ?? createdAt,
    updatedAt,
    lastTimestamp,
    fileSize,
    userCount,
    assistantCount,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    totalCost,
    customTitle,
    tokensByModel,
  };
};

const subscribeToFile = async (ws: WebSocket, jsonlPath: string, sessionId?: string, sessionName?: string): Promise<string | undefined> => {
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
      sessionName: sessionName ?? null,
      summaryResolved: false,
      processing: false,
      pendingChange: false,
      initOffsets: new Map(),
    };
    fileWatchers.set(jsonlPath, fw);
  }

  fw.connections.add(ws);
  if (sessionName && !fw.sessionName) {
    fw.sessionName = sessionName;
  }

  const result = await readTailEntries(jsonlPath, MAX_INIT_ENTRIES);

  if (result.errorCount > 0) {
    sendJson(ws, {
      type: 'timeline:error',
      code: 'parse-error',
      message: `JSONL 파싱 중 ${result.errorCount}건의 오류 발생 (해당 줄 무시됨)`,
    });
  }

  if (isNewWatcher) {
    fw.offset = result.fileSize;
    startFileWatch(fw);
  }

  const firstTimestamp = result.hasMore ? await readFirstTimestamp(jsonlPath) : null;
  const meta = computeInitMeta(result.entries, result.fileSize, firstTimestamp, result.customTitle);

  sendJson(ws, {
    type: 'timeline:init',
    entries: result.entries,
    sessionId: sessionId ?? '',
    totalEntries: result.entries.length,
    startByteOffset: result.startByteOffset,
    hasMore: result.hasMore,
    jsonlPath,
    summary: result.summary,
    meta,
  });

  if (!isNewWatcher) {
    fw.initOffsets.set(ws, result.fileSize);
  }

  if (sessionName) {
    const lastMsg = findLastUserMessage(result.entries);
    if (lastMsg) {
      await updateTabLastUserMessage(sessionName, lastMsg).catch(() => {});
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

const cancelJsonlWatcher = (sessionName: string) => {
  const w = pendingJsonlWatchers.get(sessionName);
  if (w) {
    w.stop();
    pendingJsonlWatchers.delete(sessionName);
  }
};

const watchForJsonlFile = (
  sessionName: string,
  sessionId: string,
  cwd: string,
) => {
  cancelJsonlWatcher(sessionName);

  const projectDir = cwdToProjectPath(cwd);
  const jsonlFilename = `${sessionId}.jsonl`;
  const expectedJsonlPath = path.join(projectDir, jsonlFilename);

  let dirWatcher: FSWatcher | null = null;
  let parentWatcher: FSWatcher | null = null;
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (dirWatcher) { dirWatcher.close(); dirWatcher = null; }
    if (parentWatcher) { parentWatcher.close(); parentWatcher = null; }
  };

  const onJsonlFound = async () => {
    stop();
    pendingJsonlWatchers.delete(sessionName);
    await updateTabClaudeSessionId(sessionName, sessionId).catch(() => {});

    const wsConns = getSessionConnections(sessionName);
    for (const c of wsConns) {
      if (expectedJsonlPath !== c.currentJsonlPath) {
        if (c.currentJsonlPath) {
          unsubscribeFromFile(c.ws, c.currentJsonlPath);
        }
        c.currentJsonlPath = expectedJsonlPath;
        await subscribeAndUpdateSummary(c.ws, expectedJsonlPath, sessionId, sessionName);
      }
    }
  };

  const watchProjectDir = () => {
    if (stopped) return;
    try {
      dirWatcher = watch(projectDir, (_event, filename) => {
        if (stopped) return;
        if (filename === jsonlFilename && existsSync(expectedJsonlPath)) {
          onJsonlFound();
        }
      });
      dirWatcher.on('error', () => {});
    } catch {
    }
  };

  if (existsSync(expectedJsonlPath)) {
    onJsonlFound();
    return;
  }

  if (existsSync(projectDir)) {
    watchProjectDir();
    // watch 설정 후 재확인: existsSync → watch() 사이에 파일이 생성된 경우 대응
    if (!stopped && existsSync(expectedJsonlPath)) {
      onJsonlFound();
    }
  } else {
    const projectsDir = path.dirname(projectDir);
    const projectDirName = path.basename(projectDir);
    try {
      parentWatcher = watch(projectsDir, (_event, filename) => {
        if (stopped) return;
        if (filename === projectDirName && existsSync(projectDir)) {
          if (parentWatcher) { parentWatcher.close(); parentWatcher = null; }
          if (existsSync(expectedJsonlPath)) {
            onJsonlFound();
          } else {
            watchProjectDir();
            if (!stopped && existsSync(expectedJsonlPath)) {
              onJsonlFound();
            }
          }
        }
      });
      parentWatcher.on('error', () => {});
    } catch {
    }
  }

  pendingJsonlWatchers.set(sessionName, { stop });
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
    cancelJsonlWatcher(wsKey);
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

    const skipPerms = await getDangerouslySkipPermissions();
    const settings = `--settings ${HOOK_SETTINGS_PATH}`;
    const resumeCmd = skipPerms
      ? `claude --resume ${sessionId} ${settings} --dangerously-skip-permissions`
      : `claude --resume ${sessionId} ${settings}`;
    await sendKeys(tmuxSession, resumeCmd);

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
      await subscribeAndUpdateSummary(ws, jsonlPath, sessionId, conn.sessionName);
    } else {
      sendEmptyInit(ws, sessionId);
      const cwd = await getSessionCwd(tmuxSession);
      if (cwd) {
        watchForJsonlFile(conn.sessionName, sessionId, cwd);
      }
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
        await subscribeToFile(ws, msg.jsonlPath, undefined, conn.sessionName);
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
    } catch (err) {
      log.error(`message handler error: ${err instanceof Error ? err.message : err}`);
    }
  });

  ws.on('close', () => cleanup(conn));
  ws.on('error', (err) => {
    log.error(`websocket error: ${err.message}`);
    cleanup(conn);
  });

  const claudeSessionId = url.searchParams.get('claudeSessionId');
  const sessionInfo = await detectActiveSession(panePid);

  if (conn.cleaned) return;

  if (sessionInfo.status === 'not-installed') {
    sendJson(ws, { type: 'timeline:error', code: 'not-installed', message: 'Claude CLI is not installed' });
    sendEmptyInit(ws);
    return;
  }

  if (claudeSessionId && sessionInfo.status === 'not-running') {
    await updateTabClaudeSessionId(conn.sessionName, null).catch(() => {});
    await updateTabClaudeSummary(conn.sessionName, null).catch(() => {});
  }

  // PID 파일 생성 전이지만 pane에서 claude 프로세스가 실행 중인지 확인
  const isClaudeStarting = sessionInfo.status === 'not-running'
    && !claudeSessionId
    && await isClaudeRunning(panePid);

  if (sessionInfo.status === 'running' && sessionInfo.sessionId) {
    sendJson(ws, {
      type: 'timeline:session-changed',
      newSessionId: sessionInfo.sessionId,
      reason: 'session-waiting',
    });
  } else if (isClaudeStarting) {
    sendJson(ws, {
      type: 'timeline:session-changed',
      newSessionId: '',
      reason: 'session-waiting',
    });
  }

  const effectiveSessionId = sessionInfo.sessionId ?? claudeSessionId;

  if (sessionInfo.jsonlPath) {
    conn.currentJsonlPath = sessionInfo.jsonlPath;
    if (sessionInfo.sessionId) {
      await updateTabClaudeSessionId(conn.sessionName, sessionInfo.sessionId).catch(() => {});
    }
    await subscribeAndUpdateSummary(ws, sessionInfo.jsonlPath, sessionInfo.sessionId ?? undefined, conn.sessionName);
  } else if (effectiveSessionId) {
    const jsonlPath = await resolveJsonlPath(sessionName, effectiveSessionId);
    if (jsonlPath) {
      conn.currentJsonlPath = jsonlPath;
      await subscribeAndUpdateSummary(ws, jsonlPath, effectiveSessionId, conn.sessionName);
    } else {
      sendEmptyInit(ws, effectiveSessionId);
    }
  } else if (!isClaudeStarting) {
    sendEmptyInit(ws);
  }

  if (conn.cleaned) return;

  // Watch for new sessions — shared per session key
  const wsKey = sessionName;
  if (!sessionWatchers.has(wsKey)) {
    const sw = watchSessionsDir(panePid, async (newInfo) => {
      const wsConns = getSessionConnections(sessionName);
      for (const c of wsConns) {
        if (newInfo.jsonlPath && newInfo.jsonlPath !== c.currentJsonlPath) {
          cancelJsonlWatcher(sessionName);
          if (c.currentJsonlPath) {
            unsubscribeFromFile(c.ws, c.currentJsonlPath);
          }
          c.currentJsonlPath = newInfo.jsonlPath;

          if (newInfo.sessionId) {
            await updateTabClaudeSessionId(sessionName, newInfo.sessionId).catch(() => {});
          }

          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: newInfo.sessionId ?? '',
            reason: 'new-session-started',
          });

          await subscribeAndUpdateSummary(c.ws, newInfo.jsonlPath, newInfo.sessionId ?? undefined, sessionName);
        } else if (!newInfo.jsonlPath && newInfo.status === 'not-running') {
          cancelJsonlWatcher(sessionName);
          if (c.currentJsonlPath) {
            unsubscribeFromFile(c.ws, c.currentJsonlPath);
            c.currentJsonlPath = null;
          }
          await updateTabClaudeSessionId(sessionName, null).catch(() => {});
          await updateTabClaudeSummary(sessionName, null).catch(() => {});
          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: '',
            reason: 'session-ended',
          });
        }
      }

      if (newInfo.status === 'running' && !newInfo.jsonlPath) {
        for (const c of wsConns) {
          if (c.currentJsonlPath) continue;
          if (pendingJsonlWatchers.has(sessionName)) continue;
          sendJson(c.ws, {
            type: 'timeline:session-changed',
            newSessionId: newInfo.sessionId ?? '',
            reason: 'session-waiting',
          });
        }
        if (newInfo.sessionId && newInfo.cwd) {
          const hasActiveSubscription = wsConns.some((c) => c.currentJsonlPath !== null);
          if (!hasActiveSubscription && wsConns.length > 0) {
            watchForJsonlFile(sessionName, newInfo.sessionId, newInfo.cwd);
          }
        }
      }
    }, { skipInitial: true });
    sessionWatchers.set(wsKey, sw);
  }

  if (sessionInfo.status === 'running' && !sessionInfo.jsonlPath && sessionInfo.sessionId && sessionInfo.cwd) {
    watchForJsonlFile(sessionName, sessionInfo.sessionId, sessionInfo.cwd);
  }

  // isClaudeStarting 레이스 컨디션 보완:
  // detectActiveSession → isClaudeRunning 사이에 PID 파일이 생성되면
  // 초기 감지도 놓치고 watchSessionsDir도 이미 존재하는 파일이라 이벤트가 안 옴.
  // watcher 설정 후 재확인하여 그 틈을 메운다.
  if (isClaudeStarting) {
    const recheckInfo = await detectActiveSession(panePid);
    if (conn.cleaned) return;

    if (recheckInfo.status === 'running' && recheckInfo.sessionId && !conn.currentJsonlPath) {
      await updateTabClaudeSessionId(sessionName, recheckInfo.sessionId).catch(() => {});

      if (recheckInfo.jsonlPath) {
        conn.currentJsonlPath = recheckInfo.jsonlPath;
        sendJson(ws, {
          type: 'timeline:session-changed',
          newSessionId: recheckInfo.sessionId,
          reason: 'new-session-started',
        });
        await subscribeAndUpdateSummary(ws, recheckInfo.jsonlPath, recheckInfo.sessionId, sessionName);
      } else if (recheckInfo.cwd) {
        sendJson(ws, {
          type: 'timeline:session-changed',
          newSessionId: recheckInfo.sessionId,
          reason: 'session-waiting',
        });
        sendEmptyInit(ws, recheckInfo.sessionId);
        watchForJsonlFile(sessionName, recheckInfo.sessionId, recheckInfo.cwd);
      }
    } else {
      sendEmptyInit(ws);
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
  for (const [name] of pendingJsonlWatchers) {
    cancelJsonlWatcher(name);
  }
  for (const [jsonlPath] of fileWatchers) {
    removeFileWatcher(jsonlPath);
  }
};
