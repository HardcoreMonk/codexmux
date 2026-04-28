import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import readline from 'readline';
import { getSessionCwd } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';
import { createMetaCache } from '@/lib/session-meta-cache';
import { isAgentPanelType } from '@/lib/panel-type';
import type { ISessionMeta } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

const log = createLogger('session-list');

const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '/';
const CODEX_SESSIONS_DIR = path.join(HOME_DIR, '.codex', 'sessions');
const MAX_CONCURRENCY = 10;
const MAX_FIRST_MESSAGE_LENGTH = 200;
const CODEX_THREAD_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const metaCache = createMetaCache();

const runWithConcurrency = async <T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<PromiseSettledResult<T>[]> => {
  const results: PromiseSettledResult<T>[] = new Array(tasks.length);
  let nextIndex = 0;

  const runNext = async (): Promise<void> => {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      try {
        const value = await tasks[idx]();
        results[idx] = { status: 'fulfilled', value };
      } catch (reason) {
        results[idx] = { status: 'rejected', reason };
      }
    }
  };

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => runNext());
  await Promise.all(workers);
  return results;
};

const truncateMessage = (text: string): string =>
  text.length <= MAX_FIRST_MESSAGE_LENGTH
    ? text
    : text.slice(0, MAX_FIRST_MESSAGE_LENGTH) + '…';

interface IJsonlScanResult {
  startedAt: string | null;
  firstMessage: string;
  turnCount: number;
}

interface ICodexJsonlScanResult extends IJsonlScanResult {
  sessionId: string | null;
  cwd: string | null;
}


const collectCodexJsonlFiles = async (dir: string, depth = 0): Promise<string[]> => {
  if (depth > 4) return [];

  let entries: import('fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectCodexJsonlFiles(fullPath, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
};

const extractCodexText = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';

  return content
    .map((item) => {
      if (!item || typeof item !== 'object') return '';
      const block = item as Record<string, unknown>;
      return typeof block.text === 'string' ? block.text : '';
    })
    .filter(Boolean)
    .join('\n\n');
};

const scanCodexJsonl = async (filePath: string): Promise<ICodexJsonlScanResult> => {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  let sessionId = path.basename(filePath, '.jsonl').match(CODEX_THREAD_ID_RE)?.[1] ?? null;
  let cwd: string | null = null;
  let startedAt: string | null = null;
  let firstMessage = '';
  let turnCount = 0;
  let fallbackFirstMessage = '';
  let fallbackTurnCount = 0;

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;

      let record: Record<string, unknown>;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }

      const timestamp = typeof record.timestamp === 'string' ? record.timestamp : null;
      if (!startedAt && timestamp) {
        const ts = new Date(timestamp);
        if (!Number.isNaN(ts.getTime())) startedAt = ts.toISOString();
      }

      const payload = record.payload;
      if (!payload || typeof payload !== 'object') continue;
      const data = payload as Record<string, unknown>;

      if (record.type === 'session_meta') {
        if (typeof data.id === 'string') sessionId = data.id;
        if (typeof data.cwd === 'string') cwd = data.cwd;
        if (typeof data.timestamp === 'string') {
          const ts = new Date(data.timestamp);
          if (!Number.isNaN(ts.getTime())) startedAt = ts.toISOString();
        }
        continue;
      }

      let text = '';
      if (record.type === 'event_msg' && data.type === 'user_message') {
        text = typeof data.message === 'string' ? data.message : '';
        if (text.trim()) {
          turnCount++;
          if (!firstMessage) firstMessage = truncateMessage(text.trim());
        }
      } else if (record.type === 'response_item' && data.role === 'user') {
        text = extractCodexText(data.content);
        if (text.trim() && !text.trim().startsWith('<environment_context>')) {
          fallbackTurnCount++;
          if (!fallbackFirstMessage) fallbackFirstMessage = truncateMessage(text.trim());
        }
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return {
    sessionId,
    cwd,
    startedAt,
    firstMessage: firstMessage || fallbackFirstMessage,
    turnCount: turnCount || fallbackTurnCount,
  };
};

export const parseCodexSessionMeta = async (jsonlPath: string): Promise<ISessionMeta | null> => {
  try {
    const stat = await fs.stat(jsonlPath);
    const fallbackSessionId = path.basename(jsonlPath, '.jsonl').match(CODEX_THREAD_ID_RE)?.[1] ?? path.basename(jsonlPath, '.jsonl');

    const cacheKey = `codex:${fallbackSessionId}`;
    const cached = metaCache.get(cacheKey);
    if (cached && !metaCache.isStale(cacheKey, stat.mtimeMs)) {
      return cached;
    }

    const { sessionId, startedAt: startedAtFromFile, firstMessage, turnCount } = await scanCodexJsonl(jsonlPath);
    if (!sessionId) return null;

    const meta: ISessionMeta = {
      sessionId,
      startedAt: startedAtFromFile || stat.birthtime.toISOString(),
      lastActivityAt: stat.mtime.toISOString(),
      firstMessage,
      turnCount,
    };

    metaCache.set(cacheKey, meta, stat.mtimeMs);
    return meta;
  } catch (err) {
    log.warn({ err }, `failed to parse Codex session meta: ${jsonlPath}`);
    return null;
  }
};

const listCodexSessions = async (cwd?: string): Promise<ISessionMeta[]> => {
  const files = await collectCodexJsonlFiles(CODEX_SESSIONS_DIR);
  const tasks = files.map((file) => async () => {
    try {
      const scan = await scanCodexJsonl(file);
      if (cwd && scan.cwd !== cwd) return null;

      const stat = await fs.stat(file);
      const sessionId = scan.sessionId ?? path.basename(file, '.jsonl').match(CODEX_THREAD_ID_RE)?.[1];
      if (!sessionId) return null;

      const cacheKey = `codex:${sessionId}`;
      const cached = metaCache.get(cacheKey);
      if (cached && !metaCache.isStale(cacheKey, stat.mtimeMs)) return cached;

      const meta: ISessionMeta = {
        sessionId,
        startedAt: scan.startedAt || stat.birthtime.toISOString(),
        lastActivityAt: stat.mtime.toISOString(),
        firstMessage: scan.firstMessage,
        turnCount: scan.turnCount,
      };
      metaCache.set(cacheKey, meta, stat.mtimeMs);
      return meta;
    } catch (err) {
      log.warn({ err }, `failed to parse Codex session meta: ${file}`);
      return null;
    }
  });
  const results = await runWithConcurrency(tasks, MAX_CONCURRENCY);

  const sessions: ISessionMeta[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value) {
      sessions.push(result.value);
    }
  }

  sessions.sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );

  return sessions;
};

export const listSessions = async (
  tmuxSession: string,
  cwdHint?: string,
  panelType: TPanelType = 'codex',
): Promise<ISessionMeta[]> => {
  const cwd = cwdHint || await getSessionCwd(tmuxSession);
  if (!cwd) throw new Error('cwd-lookup-failed');

  if (isAgentPanelType(panelType)) {
    return listCodexSessions(cwd);
  }

  return [];
};
