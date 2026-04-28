import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ISessionInfo } from '@/types/timeline';
import type { ISessionWatcher } from '@/lib/session-detection';
import { getChildPids, isProcessRunning } from '@/lib/session-detection';
import { isLinux } from '@/lib/platform';
import { getShellPath } from '@/lib/preflight';

const execFile = promisify(execFileCb);

const CODEX_DIR = path.join(os.homedir(), '.codex');
const CODEX_SESSIONS_DIR = path.join(CODEX_DIR, 'sessions');
const SESSION_SCAN_LIMIT = 100;
const WATCH_POLL_INTERVAL = 1500;
const INSTALL_CHECK_INTERVAL = 60_000;

interface ICodexProcess {
  pid: number;
  cwd: string | null;
}

interface ICodexSessionMeta {
  sessionId: string;
  jsonlPath: string;
  cwd: string | null;
  startedAt: number | null;
  mtimeMs: number;
}

const THREAD_ID_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

const getProcessCwd = async (pid: number): Promise<string | null> => {
  if (isLinux) {
    try {
      return await fs.readlink(`/proc/${pid}/cwd`);
    } catch {
      return null;
    }
  }

  try {
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n/'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
};

const collectProcessTree = async (panePid: number, preloadedChildPids?: number[]): Promise<number[]> => {
  const direct = preloadedChildPids ?? await getChildPids(panePid);
  const grandchildren = (await Promise.all(direct.map(getChildPids))).flat();
  return [...direct, ...grandchildren];
};

const findCodexProcess = async (
  panePid: number,
  preloadedChildPids?: number[],
): Promise<ICodexProcess | null> => {
  const pids = await collectProcessTree(panePid, preloadedChildPids);
  for (const pid of pids) {
    try {
      const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'comm=', '-o', 'args=']);
      if (!/\bcodex\b/.test(stdout)) continue;
      return { pid, cwd: await getProcessCwd(pid) };
    } catch {
      continue;
    }
  }
  return null;
};

const isCodexInstalled = async (): Promise<boolean> => {
  try {
    await execFile('codex', ['--version'], {
      timeout: 5000,
      env: { ...process.env, PATH: await getShellPath() },
    });
    return true;
  } catch {
    return false;
  }
};

const collectJsonlFiles = async (dir: string, depth = 0): Promise<string[]> => {
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
      files.push(...await collectJsonlFiles(fullPath, depth + 1));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      files.push(fullPath);
    }
  }
  return files;
};

const readSessionMeta = async (jsonlPath: string): Promise<ICodexSessionMeta | null> => {
  let stat: import('fs').Stats;
  try {
    stat = await fs.stat(jsonlPath);
  } catch {
    return null;
  }

  const fallbackId = path.basename(jsonlPath, '.jsonl').match(THREAD_ID_RE)?.[1] ?? null;
  let sessionId = fallbackId;
  let cwd: string | null = null;
  let startedAt: number | null = null;

  try {
    const handle = await fs.open(jsonlPath, 'r');
    try {
      const readSize = Math.min(stat.size, 64 * 1024);
      const buffer = Buffer.alloc(readSize);
      await handle.read(buffer, 0, readSize, 0);
      for (const line of buffer.toString('utf-8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const record = JSON.parse(line);
          if (record.type !== 'session_meta' || !record.payload) continue;
          if (typeof record.payload.id === 'string') sessionId = record.payload.id;
          if (typeof record.payload.cwd === 'string') cwd = record.payload.cwd;
          const ts = typeof record.payload.timestamp === 'string'
            ? Date.parse(record.payload.timestamp)
            : Date.parse(record.timestamp);
          if (Number.isFinite(ts)) startedAt = ts;
          break;
        } catch {
          continue;
        }
      }
    } finally {
      await handle.close();
    }
  } catch {
    // keep fallback id
  }

  if (!sessionId) return null;
  return { sessionId, jsonlPath, cwd, startedAt, mtimeMs: stat.mtimeMs };
};

export const findCodexSessionJsonl = async (
  sessionId?: string | null,
  cwd?: string | null,
): Promise<ICodexSessionMeta | null> => {
  const files = await collectJsonlFiles(CODEX_SESSIONS_DIR);
  const metas = (await Promise.all(files.map(readSessionMeta)))
    .filter((meta): meta is ICodexSessionMeta => !!meta)
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (sessionId) {
    const byId = metas.find((meta) => meta.sessionId === sessionId);
    if (byId) return byId;
  }

  const candidates = cwd
    ? metas.filter((meta) => meta.cwd === cwd)
    : metas;
  return candidates.slice(0, SESSION_SCAN_LIMIT)[0] ?? null;
};

export const isCodexRunning = async (
  panePid: number,
  preloadedChildPids?: number[],
): Promise<boolean> => !!(await findCodexProcess(panePid, preloadedChildPids));

export const detectActiveCodexSession = async (
  panePid: number,
  preloadedChildPids?: number[],
): Promise<ISessionInfo> => {
  try {
    await fs.access(CODEX_DIR);
  } catch {
    const installed = await isCodexInstalled();
    return {
      status: installed ? 'not-initialized' : 'not-installed',
      sessionId: null,
      jsonlPath: null,
      pid: null,
      startedAt: null,
      cwd: null,
    };
  }

  const codexProcess = await findCodexProcess(panePid, preloadedChildPids);
  if (!codexProcess) {
    return { status: 'not-running', sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
  }

  const session = await findCodexSessionJsonl(null, codexProcess.cwd);
  return {
    status: 'running',
    sessionId: session?.sessionId ?? null,
    jsonlPath: session?.jsonlPath ?? null,
    pid: codexProcess.pid,
    startedAt: session?.startedAt ?? null,
    cwd: codexProcess.cwd,
  };
};

const sameSessionInfo = (a: ISessionInfo | null, b: ISessionInfo): boolean =>
  !!a
  && a.status === b.status
  && a.sessionId === b.sessionId
  && a.jsonlPath === b.jsonlPath
  && a.pid === b.pid
  && a.cwd === b.cwd;

export const watchCodexSessions = (
  panePid: number,
  onChange: (info: ISessionInfo) => void,
  options?: { skipInitial?: boolean },
): ISessionWatcher => {
  let sessionWatcher: FSWatcher | null = null;
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  let installCheckTimer: ReturnType<typeof setInterval> | null = null;
  let stopped = false;
  let lastInfo: ISessionInfo | null = null;

  const emitIfChanged = async () => {
    if (stopped) return;
    const info = await detectActiveCodexSession(panePid);
    if (stopped || sameSessionInfo(lastInfo, info)) return;
    lastInfo = info;
    onChange(info);
  };

  const tryWatch = () => {
    if (stopped) return;
    try {
      sessionWatcher = watch(CODEX_SESSIONS_DIR, { recursive: true }, () => {
        emitIfChanged().catch(() => {});
      });
      sessionWatcher.on('error', () => {});
      if (installCheckTimer) {
        clearInterval(installCheckTimer);
        installCheckTimer = null;
      }
    } catch {
      if (!installCheckTimer) {
        installCheckTimer = setInterval(async () => {
          try {
            await fs.access(CODEX_SESSIONS_DIR);
            tryWatch();
            await emitIfChanged();
          } catch {
            // not initialized yet
          }
        }, INSTALL_CHECK_INTERVAL);
      }
    }
  };

  tryWatch();
  pollTimer = setInterval(async () => {
    if (lastInfo?.pid && !(await isProcessRunning(lastInfo.pid))) {
      lastInfo = null;
    }
    emitIfChanged().catch(() => {});
  }, WATCH_POLL_INTERVAL);

  if (!options?.skipInitial) {
    emitIfChanged().catch(() => {});
  }

  return {
    stop: () => {
      stopped = true;
      if (sessionWatcher) sessionWatcher.close();
      if (pollTimer) clearInterval(pollTimer);
      if (installCheckTimer) clearInterval(installCheckTimer);
    },
  };
};
