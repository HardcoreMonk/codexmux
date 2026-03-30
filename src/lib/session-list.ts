import fs from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import readline from 'readline';
import { toClaudeProjectName } from '@/lib/session-detection';
import { getSessionCwd } from '@/lib/tmux';
import { createMetaCache } from '@/lib/session-meta-cache';
import type { ISessionMeta } from '@/types/timeline';

const PROJECTS_DIR = path.join(
  process.env.HOME || process.env.USERPROFILE || '/',
  '.claude',
  'projects',
);
const MAX_CONCURRENCY = 10;
const MAX_FIRST_MESSAGE_LENGTH = 200;

const metaCache = createMetaCache();

export const cwdToProjectPath = (cwd: string): string => {
  const projectName = toClaudeProjectName(cwd);
  return path.join(PROJECTS_DIR, projectName);
};

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

const extractFirstHumanMessage = async (filePath: string): Promise<string> => {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if ((entry.type === 'human' || entry.type === 'user') && !entry.isMeta) {
          const msg = entry.message;
          if (!msg) continue;
          if (typeof msg === 'string') return truncateMessage(msg);
          if (Array.isArray(msg.content)) {
            const textBlock = msg.content.find(
              (b: { type: string; text?: string }) => b.type === 'text' && b.text,
            );
            if (textBlock) return truncateMessage(textBlock.text);
          }
          if (typeof msg.content === 'string') return truncateMessage(msg.content);
        }
      } catch {
        continue;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return '';
};

const countHumanTurns = async (filePath: string): Promise<number> => {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let count = 0;

  try {
    for await (const line of rl) {
      const isHumanOrUser =
        line.includes('"type":"human"') ||
        line.includes('"type": "human"') ||
        line.includes('"type":"user"') ||
        line.includes('"type": "user"');
      if (isHumanOrUser && !line.includes('"isMeta":true') && !line.includes('"isMeta": true')) {
        count++;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return count;
};

const extractStartedAt = async (filePath: string): Promise<string | null> => {
  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.timestamp) {
          return new Date(entry.timestamp).toISOString();
        }
      } catch {
        break;
      }
      break;
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return null;
};

export const parseSessionMeta = async (jsonlPath: string): Promise<ISessionMeta | null> => {
  try {
    const stat = await fs.stat(jsonlPath);
    const sessionId = path.basename(jsonlPath, '.jsonl');

    const cached = metaCache.get(sessionId);
    if (cached && !metaCache.isStale(sessionId, stat.mtimeMs)) {
      return cached;
    }

    const [startedAtFromFile, firstMessage, turnCount] = await Promise.all([
      extractStartedAt(jsonlPath),
      extractFirstHumanMessage(jsonlPath),
      countHumanTurns(jsonlPath),
    ]);

    const startedAt = startedAtFromFile || stat.birthtime.toISOString();
    const lastActivityAt = stat.mtime.toISOString();

    const meta: ISessionMeta = {
      sessionId,
      startedAt,
      lastActivityAt,
      firstMessage,
      turnCount,
    };

    metaCache.set(sessionId, meta, stat.mtimeMs);
    return meta;
  } catch (err) {
    console.warn(`[session-list] failed to parse session meta: ${jsonlPath}`, err);
    return null;
  }
};

export const listSessions = async (tmuxSession: string, cwdHint?: string): Promise<ISessionMeta[]> => {
  const cwd = cwdHint || await getSessionCwd(tmuxSession);
  if (!cwd) throw new Error('cwd-lookup-failed');

  const projectDir = cwdToProjectPath(cwd);

  let files: string[];
  try {
    const entries = await fs.readdir(projectDir);
    files = entries.filter(
      (f) => f.endsWith('.jsonl') && !f.startsWith('agent-'),
    );
  } catch {
    return [];
  }

  const tasks = files.map((file) => () => parseSessionMeta(path.join(projectDir, file)));
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
