import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { nanoid } from 'nanoid';
import { createLogger } from '@/lib/logger';

const log = createLogger('terminal');

const execFile = promisify(execFileCb);

const TMUX_SOCKET = 'purple';
const TMUX_CONFIG_PATH = path.join(process.env.__PMUX_APP_DIR_UNPACKED || process.env.__PMUX_APP_DIR || process.cwd(), 'src', 'config', 'tmux.conf');
const CMD_TIMEOUT = 5000;

const SENSITIVE_KEYS = new Set(['AUTH_PASSWORD', 'NEXTAUTH_SECRET']);

export const sanitizedEnv = (): NodeJS.ProcessEnv =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith('npm_') && !key.startsWith('NODE_') && !SENSITIVE_KEYS.has(key),
    ),
  ) as NodeJS.ProcessEnv;

export const listSessions = async (): Promise<string[]> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'ls', '-F', '#{session_name}'],
      { timeout: CMD_TIMEOUT },
    );
    return stdout
      .trim()
      .split('\n')
      .map((line) => line.trim())
      .filter((name) => name.startsWith('pt-'));
  } catch {
    return [];
  }
};

export const createSession = async (
  name: string,
  cols: number,
  rows: number,
  cwd?: string,
): Promise<void> => {
  const shell = process.env.SHELL || '/bin/zsh';
  await execFile(
    'tmux',
    [
      '-u',
      '-L', TMUX_SOCKET,
      '-f', TMUX_CONFIG_PATH,
      'new-session', '-d',
      '-s', name,
      '-x', String(cols),
      '-y', String(rows),
      shell,
    ],
    {
      timeout: CMD_TIMEOUT,
      env: {
        ...sanitizedEnv(),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      cwd: cwd || process.env.HOME || '/',
    },
  );
  await applyConfig();
  log.debug(`tmux session created: ${name} (cols: ${cols}, rows: ${rows})`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const killSession = async (name: string): Promise<void> => {
  if (!(await hasSession(name))) return;

  log.info(`killSession start: ${name}`);
  const panePid = await getSessionPanePid(name);
  if (panePid) {
    try {
      log.info(`SIGTERM → process group ${panePid}: ${name}`);
      process.kill(-panePid, 'SIGTERM');
    } catch {
      // process group already gone
    }
  }

  try {
    await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'kill-session', '-t', name],
      { timeout: CMD_TIMEOUT },
    );
  } catch {
    // kill-session failed, will verify below
  }

  for (let i = 0; i < 5; i++) {
    if (!(await hasSession(name))) {
      log.info(`killSession done (SIGTERM): ${name}`);
      return;
    }
    await sleep(200);
  }

  // Still alive — escalate to SIGKILL
  log.warn(`session survived SIGTERM, escalating to SIGKILL: ${name}`);
  if (panePid) {
    try {
      log.info(`SIGKILL → process group ${panePid}: ${name}`);
      process.kill(-panePid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
  try {
    await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'kill-session', '-t', name],
      { timeout: CMD_TIMEOUT },
    );
  } catch {
    // already gone
  }

  for (let i = 0; i < 3; i++) {
    if (!(await hasSession(name))) {
      log.info(`killSession done (SIGKILL): ${name}`);
      return;
    }
    await sleep(200);
  }

  log.warn(`tmux session still alive after kill: ${name}`);
};

export const hasSession = async (name: string): Promise<boolean> => {
  try {
    await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'has-session', '-t', name],
      { timeout: CMD_TIMEOUT },
    );
    return true;
  } catch {
    return false;
  }
};

// tmux auto-cleans dead sessions when remain-on-exit is not set, no extra handling needed
export const cleanDeadSessions = async (): Promise<void> => {};

export const scanSessions = async (): Promise<void> => {
  await cleanDeadSessions();
  const sessions = await listSessions();
  if (sessions.length > 0) {
    sessions.forEach((name) => {
      log.debug(`existing tmux session found: ${name}`);
    });
  }
};

export const getSessionCwd = async (sessionName: string): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'display-message', '-p', '-t', sessionName, '#{pane_current_path}'],
      { timeout: CMD_TIMEOUT },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

export const getSessionPanePid = async (sessionName: string): Promise<number | null> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'display-message', '-p', '-t', sessionName, '#{pane_pid}'],
      { timeout: CMD_TIMEOUT },
    );
    const pid = parseInt(stdout.trim(), 10);
    return Number.isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
};

export const applyConfig = async (): Promise<void> => {
  try {
    await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'source-file', TMUX_CONFIG_PATH],
      { timeout: CMD_TIMEOUT },
    );
  } catch {
    // Server not running yet, config will be applied on first session
  }
};

export const defaultSessionName = (): string =>
  `pt-${nanoid(6)}-${nanoid(6)}-${nanoid(6)}`;

export const workspaceSessionName = (wsId: string, paneId: string, tabId: string): string =>
  `pt-${wsId}-${paneId}-${tabId}`;

export const getPaneCurrentCommand = async (
  sessionName: string,
): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'list-panes', '-t', sessionName, '-F', '#{pane_current_command}'],
      { timeout: CMD_TIMEOUT },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

export interface IPaneInfo {
  command: string;
  path: string;
  pid: number;
  windowActivity: number;
}

export const getAllPanesInfo = async (): Promise<Map<string, IPaneInfo>> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'list-panes', '-a', '-F', '#{session_name}\t#{pane_current_command}\t#{pane_current_path}\t#{pane_pid}\t#{window_activity}'],
      { timeout: CMD_TIMEOUT },
    );
    const result = new Map<string, IPaneInfo>();
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const [session, command, path, pidStr, activityStr] = line.split('\t');
      if (session && command) {
        const pid = parseInt(pidStr, 10);
        const windowActivity = parseInt(activityStr, 10);
        result.set(session, {
          command,
          path: path || '',
          pid: Number.isNaN(pid) ? 0 : pid,
          windowActivity: Number.isNaN(windowActivity) ? 0 : windowActivity,
        });
      }
    }
    return result;
  } catch {
    return new Map();
  }
};

export const SAFE_SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash']);

export const checkTerminalProcess = async (
  tmuxSession: string,
): Promise<{ isSafe: boolean; processName: string }> => {
  const command = await getPaneCurrentCommand(tmuxSession);
  if (!command) {
    return { isSafe: false, processName: 'unknown' };
  }
  return {
    isSafe: SAFE_SHELLS.has(command),
    processName: command,
  };
};

export const getPaneTitle = async (sessionName: string): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'display-message', '-p', '-t', sessionName, '#{pane_title}'],
      { timeout: CMD_TIMEOUT },
    );
    return stdout.trim() || null;
  } catch {
    return null;
  }
};

export const exitCopyMode = async (sessionName: string): Promise<void> => {
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'copy-mode', '-q', '-t', sessionName],
    { timeout: CMD_TIMEOUT },
  ).catch(() => {});
};

export const sendKeys = async (
  sessionName: string,
  command: string,
): Promise<void> => {
  await exitCopyMode(sessionName);
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, command, 'Enter'],
    { timeout: CMD_TIMEOUT },
  );
};

export const sendRawKeys = async (
  sessionName: string,
  keys: string,
): Promise<void> => {
  await exitCopyMode(sessionName);
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, keys],
    { timeout: CMD_TIMEOUT },
  );
};

/** Send text via bracketed paste mode and press Enter twice (handles Claude Code long input confirmation) */
export const sendBracketedPaste = async (
  sessionName: string,
  content: string,
): Promise<void> => {
  await exitCopyMode(sessionName);
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, '-l', `\x1b[200~${content}\x1b[201~`],
    { timeout: CMD_TIMEOUT },
  );
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, 'Enter'],
    { timeout: CMD_TIMEOUT },
  );
  await new Promise((resolve) => setTimeout(resolve, 500));
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, 'Enter'],
    { timeout: CMD_TIMEOUT },
  );
};


export interface IPaneDetailInfo {
  cwd: string | null;
  command: string | null;
  pid: number | null;
  width: number | null;
  height: number | null;
  sessionCreated: number | null;
}

export const getPaneDetailInfo = async (
  sessionName: string,
): Promise<IPaneDetailInfo> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      [
        '-L', TMUX_SOCKET,
        'display-message', '-p', '-t', sessionName,
        '#{pane_current_path}\t#{pane_current_command}\t#{pane_pid}\t#{pane_width}\t#{pane_height}\t#{session_created}',
      ],
      { timeout: CMD_TIMEOUT },
    );
    const [cwdStr, command, pidStr, widthStr, heightStr, createdStr] = stdout.trim().split('\t');
    return {
      cwd: cwdStr || null,
      command: command || null,
      pid: pidStr ? parseInt(pidStr, 10) || null : null,
      width: widthStr ? parseInt(widthStr, 10) || null : null,
      height: heightStr ? parseInt(heightStr, 10) || null : null,
      sessionCreated: createdStr ? parseInt(createdStr, 10) || null : null,
    };
  } catch {
    return { cwd: null, command: null, pid: null, width: null, height: null, sessionCreated: null };
  }
};

const INTERPRETERS = new Set(['node', 'python', 'python3', 'ruby', 'perl', 'deno', 'bun']);

const cleanCommandLine = (raw: string): string => {
  const parts = raw.split(/\s+/);
  if (parts.length === 0) return raw;

  parts[0] = path.basename(parts[0]);

  if (INTERPRETERS.has(parts[0]) && parts.length > 1) {
    const scriptName = path.basename(parts[1]).replace(/\.(c|m)?js$/, '');
    parts.splice(0, 2, scriptName);
  }

  return parts.join(' ');
};

export const killServer = async (): Promise<void> => {
  try {
    await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'kill-server'],
      { timeout: CMD_TIMEOUT },
    );
    log.info('tmux server killed');
  } catch {
    // Server may not be running
  }
};

export const capturePaneContent = async (sessionName: string): Promise<string | null> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'capture-pane', '-p', '-t', sessionName],
      { timeout: CMD_TIMEOUT },
    );
    return stdout;
  } catch {
    return null;
  }
};

const getDescendantPids = async (rootPid: number): Promise<number[]> => {
  const all: number[] = [];
  let frontier = [rootPid];
  while (frontier.length > 0) {
    try {
      const { stdout } = await execFile('pgrep', ['-P', frontier.join(',')], { timeout: CMD_TIMEOUT });
      const children = stdout.trim().split('\n').map((s) => parseInt(s, 10)).filter((n) => !Number.isNaN(n));
      if (children.length === 0) break;
      all.push(...children);
      frontier = children;
    } catch {
      break;
    }
  }
  return all;
};

export const getListeningPorts = async (shellPid: number): Promise<number[]> => {
  const pids = await getDescendantPids(shellPid);
  if (pids.length === 0) return [];

  try {
    const { stdout } = await execFile(
      'lsof',
      ['-a', '-p', pids.join(','), '-i', '-sTCP:LISTEN', '-P', '-Fn'],
      { timeout: CMD_TIMEOUT },
    );
    const ports = new Set<number>();
    for (const line of stdout.split('\n')) {
      if (line.startsWith('n')) {
        const match = line.match(/:(\d+)$/);
        if (match) ports.add(parseInt(match[1], 10));
      }
    }
    return [...ports].sort((a, b) => a - b);
  } catch {
    return [];
  }
};

export const getLastCommand = async (sessionName: string): Promise<string | null> => {
  const shellPid = await getSessionPanePid(sessionName);
  if (!shellPid) return null;

  try {
    const { stdout: pgrepOut } = await execFile(
      'pgrep', ['-n', '-P', String(shellPid)],
      { timeout: CMD_TIMEOUT },
    );
    const childPid = pgrepOut.trim();
    if (!childPid) return null;

    const { stdout: psOut } = await execFile(
      'ps', ['-o', 'args=', '-p', childPid],
      { timeout: CMD_TIMEOUT },
    );
    const args = psOut.trim();
    if (!args) return null;

    return cleanCommandLine(args);
  } catch {
    return null;
  }
};
