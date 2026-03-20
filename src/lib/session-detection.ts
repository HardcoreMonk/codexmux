import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import os from 'os';
import { execFile } from 'child_process';
import type { ISessionInfo } from '@/types/timeline';

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const PID_POLL_INTERVAL = 10_000;
const SESSION_DIR_DEBOUNCE = 200;

interface IPidFileData {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

const dirToProjectName = (dir: string): string =>
  dir.replace(/\//g, '-');

const isProcessRunning = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFile('ps', ['-p', String(pid)], (err) => {
      resolve(!err);
    });
  });

const readPidFile = async (filePath: string): Promise<IPidFileData | null> => {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (!data.pid || !data.sessionId) return null;
    return data as IPidFileData;
  } catch {
    return null;
  }
};

const findJsonlPath = async (projectDir: string, sessionId: string): Promise<string | null> => {
  const jsonlPath = path.join(projectDir, `${sessionId}.jsonl`);
  try {
    await fs.access(jsonlPath);
    return jsonlPath;
  } catch {
    return null;
  }
};

const findLatestJsonl = async (projectDir: string): Promise<{ sessionId: string; jsonlPath: string } | null> => {
  try {
    const files = await fs.readdir(projectDir);
    const jsonlFiles = files.filter(
      (f) => f.endsWith('.jsonl') && !f.startsWith('agent-'),
    );
    if (jsonlFiles.length === 0) return null;

    let latest: { file: string; mtime: number } | null = null;
    for (const file of jsonlFiles) {
      const stat = await fs.stat(path.join(projectDir, file));
      if (!latest || stat.mtimeMs > latest.mtime) {
        latest = { file, mtime: stat.mtimeMs };
      }
    }
    if (!latest) return null;

    const sessionId = latest.file.replace('.jsonl', '');
    return { sessionId, jsonlPath: path.join(projectDir, latest.file) };
  } catch {
    return null;
  }
};

export const detectSession = async (workspaceDir: string): Promise<ISessionInfo> => {
  try {
    await fs.access(CLAUDE_DIR);
  } catch {
    return { status: 'not-installed', sessionId: null, jsonlPath: null, pid: null, startedAt: null };
  }

  const projectName = dirToProjectName(workspaceDir);
  const projectDir = path.join(PROJECTS_DIR, projectName);

  const activeSessions: (IPidFileData & { pidFile: string })[] = [];

  try {
    const pidFiles = await fs.readdir(SESSIONS_DIR);
    const jsonFiles = pidFiles.filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const data = await readPidFile(path.join(SESSIONS_DIR, file));
      if (!data) continue;
      if (data.cwd !== workspaceDir) continue;

      const running = await isProcessRunning(data.pid);
      if (!running) {
        try {
          await fs.unlink(path.join(SESSIONS_DIR, file));
        } catch {}
        continue;
      }

      activeSessions.push({ ...data, pidFile: file });
    }
  } catch {
    // sessions dir doesn't exist yet
  }

  if (activeSessions.length > 0) {
    activeSessions.sort((a, b) => b.startedAt - a.startedAt);
    const session = activeSessions[0];
    const jsonlPath = await findJsonlPath(projectDir, session.sessionId);

    return {
      status: 'active',
      sessionId: session.sessionId,
      jsonlPath,
      pid: session.pid,
      startedAt: session.startedAt,
    };
  }

  const fallback = await findLatestJsonl(projectDir);
  if (fallback) {
    return {
      status: 'inactive',
      sessionId: fallback.sessionId,
      jsonlPath: fallback.jsonlPath,
      pid: null,
      startedAt: null,
    };
  }

  return { status: 'none', sessionId: null, jsonlPath: null, pid: null, startedAt: null };
};

export interface ISessionWatcher {
  stop: () => void;
}

export const watchSessionDir = (
  workspaceDir: string,
  onChange: (info: ISessionInfo) => void,
): ISessionWatcher => {
  let watcher: FSWatcher | null = null;
  let pidPollTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let currentPid: number | null = null;
  let stopped = false;

  const pollPid = async () => {
    if (stopped || !currentPid) return;
    const running = await isProcessRunning(currentPid);
    if (!running && !stopped) {
      currentPid = null;
      const info = await detectSession(workspaceDir);
      onChange(info);
    }
  };

  const handleSessionDirChange = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (stopped) return;
      const info = await detectSession(workspaceDir);
      if (info.pid) currentPid = info.pid;
      onChange(info);
    }, SESSION_DIR_DEBOUNCE);
  };

  try {
    watcher = watch(SESSIONS_DIR, handleSessionDirChange);
    watcher.on('error', () => {});
  } catch {}

  pidPollTimer = setInterval(pollPid, PID_POLL_INTERVAL);

  detectSession(workspaceDir).then((info) => {
    if (stopped) return;
    if (info.pid) currentPid = info.pid;
    onChange(info);
  });

  return {
    stop: () => {
      stopped = true;
      if (watcher) watcher.close();
      if (pidPollTimer) clearInterval(pidPollTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
    },
  };
};
