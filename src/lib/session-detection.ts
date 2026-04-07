import fs from 'fs/promises';
import { watch, type FSWatcher } from 'fs';
import path from 'path';
import os from 'os';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import type { ISessionInfo } from '@/types/timeline';
import { shellPath } from '@/lib/preflight';

const execFile = promisify(execFileCb);

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const PROJECTS_DIR = path.join(CLAUDE_DIR, 'projects');
const CLAUDE_KNOWN_PATHS = [path.join(os.homedir(), '.local', 'bin', 'claude')];
const PID_POLL_INTERVAL = 10_000;
const SESSION_DIR_DEBOUNCE = 200;
const INSTALL_CHECK_INTERVAL = 60_000;

interface IPidFileData {
  pid: number;
  sessionId: string;
  cwd: string;
  startedAt: number;
}

export const toClaudeProjectName = (dirPath: string): string =>
  dirPath.replace(/[/.]/g, '-');

export const isProcessRunning = (pid: number): Promise<boolean> =>
  new Promise((resolve) => {
    execFileCb('ps', ['-p', String(pid)], (err) => {
      resolve(!err);
    });
  });

export const getChildPids = async (parentPid: number): Promise<number[]> => {
  try {
    const { stdout } = await execFile('pgrep', ['-P', String(parentPid)]);
    return stdout.trim().split('\n').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
  } catch {
    return [];
  }
};

const getProcessCwd = async (pid: number): Promise<string | null> => {
  try {
    const { stdout } = await execFile('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn']);
    const line = stdout.split('\n').find((l) => l.startsWith('n/'));
    return line ? line.slice(1) : null;
  } catch {
    return null;
  }
};

const getClaudeSessionFromArgs = async (
  childPids: number[],
): Promise<{ pid: number; sessionId: string; cwd: string | null } | null> => {
  for (const pid of childPids) {
    try {
      const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'args=']);
      const args = stdout.trim();
      const match = args.match(/claude\s+--resume\s+([0-9a-f-]{36})/);
      if (match) {
        const cwd = await getProcessCwd(pid);
        return { pid, sessionId: match[1], cwd };
      }
    } catch {
      continue;
    }
  }
  return null;
};

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

const isClaudeInstalled = async (): Promise<boolean> => {
  try {
    await execFile('claude', ['--version'], { timeout: 5000, env: { ...process.env, PATH: shellPath } });
    return true;
  } catch {
    for (const p of CLAUDE_KNOWN_PATHS) {
      try {
        await fs.access(p);
        return true;
      } catch {
        // not found
      }
    }
    return false;
  }
};

export const isClaudeRunning = async (panePid: number, preloadedChildPids?: number[]): Promise<boolean> => {
  const childPids = preloadedChildPids ?? await getChildPids(panePid);
  for (const pid of childPids) {
    try {
      const { stdout } = await execFile('ps', ['-p', String(pid), '-o', 'args=']);
      if (stdout.trim().includes('claude')) return true;
    } catch {
      continue;
    }
  }
  return false;
};

export const detectActiveSession = async (panePid: number, preloadedChildPids?: number[]): Promise<ISessionInfo> => {
  try {
    await fs.access(CLAUDE_DIR);
  } catch {
    const installed = await isClaudeInstalled();
    const status = installed ? 'not-initialized' : 'not-installed';
    return { status, sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
  }

  const childPids = preloadedChildPids ?? await getChildPids(panePid);

  if (childPids.length === 0) {
    return { status: 'not-running', sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
  }

  const childPidSet = new Set(childPids);

  try {
    const pidFiles = await fs.readdir(SESSIONS_DIR);
    const jsonFiles = pidFiles.filter((f) => f.endsWith('.json'));

    for (const file of jsonFiles) {
      const data = await readPidFile(path.join(SESSIONS_DIR, file));
      if (!data) continue;
      if (!childPidSet.has(data.pid)) continue;

      let processArgs = '';
      try {
        const { stdout } = await execFile('ps', ['-p', String(data.pid), '-o', 'args=']);
        processArgs = stdout.trim();
      } catch {
        try { await fs.unlink(path.join(SESSIONS_DIR, file)); } catch {}
        continue;
      }

      if (!processArgs.includes('claude')) {
        try { await fs.unlink(path.join(SESSIONS_DIR, file)); } catch {}
        continue;
      }

      const projectName = toClaudeProjectName(data.cwd);
      const projectDir = path.join(PROJECTS_DIR, projectName);
      let jsonlPath = await findJsonlPath(projectDir, data.sessionId);
      let effectiveSessionId = data.sessionId;

      if (!jsonlPath) {
        const resumeMatch = processArgs.match(/--resume\s+([0-9a-f-]{36})/);
        if (resumeMatch) {
          const resumeSessionId = resumeMatch[1];
          const resumeJsonlPath = await findJsonlPath(projectDir, resumeSessionId);
          if (resumeJsonlPath) {
            jsonlPath = resumeJsonlPath;
            effectiveSessionId = resumeSessionId;
          }
        }
      }

      return {
        status: 'running',
        sessionId: effectiveSessionId,
        jsonlPath,
        pid: data.pid,
        startedAt: data.startedAt,
        cwd: data.cwd,
      };
    }
  } catch {
    // sessions dir doesn't exist yet
  }

  const fromArgs = await getClaudeSessionFromArgs(childPids);
  if (fromArgs) {
    const cwd = fromArgs.cwd;
    if (cwd) {
      const projectName = toClaudeProjectName(cwd);
      const projectDir = path.join(PROJECTS_DIR, projectName);
      const jsonlPath = await findJsonlPath(projectDir, fromArgs.sessionId);
      return {
        status: 'running',
        sessionId: fromArgs.sessionId,
        jsonlPath,
        pid: fromArgs.pid,
        startedAt: null,
        cwd,
      };
    }
  }

  return { status: 'not-running', sessionId: null, jsonlPath: null, pid: null, startedAt: null, cwd: null };
};

export interface ISessionWatcher {
  stop: () => void;
}

export const watchSessionsDir = (
  panePid: number,
  onChange: (info: ISessionInfo) => void,
  options?: { skipInitial?: boolean },
): ISessionWatcher => {
  let watcher: FSWatcher | null = null;
  let pidPollTimer: ReturnType<typeof setInterval> | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let installCheckTimer: ReturnType<typeof setInterval> | null = null;
  let currentPid: number | null = null;
  let stopped = false;

  const pollPid = async () => {
    if (stopped || !currentPid) return;
    const running = await isProcessRunning(currentPid);
    if (!running && !stopped) {
      currentPid = null;
      const info = await detectActiveSession(panePid);
      onChange(info);
    }
  };

  const handleSessionDirChange = () => {
    if (stopped) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      if (stopped) return;
      const info = await detectActiveSession(panePid);
      if (info.pid) currentPid = info.pid;
      onChange(info);
    }, SESSION_DIR_DEBOUNCE);
  };

  const tryWatch = () => {
    if (stopped) return;
    try {
      watcher = watch(SESSIONS_DIR, handleSessionDirChange);
      watcher.on('error', () => {});
      if (installCheckTimer) {
        clearInterval(installCheckTimer);
        installCheckTimer = null;
      }
    } catch {
      if (!installCheckTimer) {
        installCheckTimer = setInterval(async () => {
          if (stopped) return;
          try {
            await fs.access(SESSIONS_DIR);
            tryWatch();
            const info = await detectActiveSession(panePid);
            if (info.pid) currentPid = info.pid;
            onChange(info);
          } catch {}
        }, INSTALL_CHECK_INTERVAL);
      }
    }
  };

  tryWatch();
  pidPollTimer = setInterval(pollPid, PID_POLL_INTERVAL);

  if (!options?.skipInitial) {
    detectActiveSession(panePid).then((info) => {
      if (stopped) return;
      if (info.pid) currentPid = info.pid;
      onChange(info);
    });
  }

  return {
    stop: () => {
      stopped = true;
      if (watcher) watcher.close();
      if (pidPollTimer) clearInterval(pidPollTimer);
      if (debounceTimer) clearTimeout(debounceTimer);
      if (installCheckTimer) clearInterval(installCheckTimer);
    },
  };
};
