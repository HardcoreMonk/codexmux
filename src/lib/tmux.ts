import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { nanoid } from 'nanoid';

const execFile = promisify(execFileCb);

const TMUX_SOCKET = 'purple';
const TMUX_CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'tmux.conf');
const CMD_TIMEOUT = 5000;

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
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
      cwd: cwd || process.env.HOME || '/',
    },
  );
  console.log(`[terminal] tmux session created: ${name} (cols: ${cols}, rows: ${rows})`);
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const killSession = async (name: string): Promise<void> => {
  if (!(await hasSession(name))) return;

  const panePid = await getSessionPanePid(name);
  if (panePid) {
    try {
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
    if (!(await hasSession(name))) return;
    await sleep(200);
  }

  // 아직 살아있으면 SIGKILL로 강제 종료
  if (panePid) {
    try {
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
    if (!(await hasSession(name))) return;
    await sleep(200);
  }

  console.warn(`[terminal] tmux session still alive after kill: ${name}`);
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

export const cleanDeadSessions = async (): Promise<void> => {
  const sessions = await listSessions();
  for (const name of sessions) {
    const alive = await hasSession(name);
    if (!alive) {
      try {
        await killSession(name);
        console.log(`[terminal] cleaned dead tmux session: ${name}`);
      } catch {
        // session already gone
      }
    }
  }
};

export const scanSessions = async (): Promise<void> => {
  await cleanDeadSessions();
  const sessions = await listSessions();
  if (sessions.length > 0) {
    sessions.forEach((name) => {
      console.log(`[terminal] existing tmux session found: ${name}`);
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
  pid: number;
}

export const getAllPanesInfo = async (): Promise<Map<string, IPaneInfo>> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'list-panes', '-a', '-F', '#{session_name}\t#{pane_current_command}\t#{pane_pid}'],
      { timeout: CMD_TIMEOUT },
    );
    const result = new Map<string, IPaneInfo>();
    for (const line of stdout.trim().split('\n')) {
      if (!line) continue;
      const [session, command, pidStr] = line.split('\t');
      if (session && command) {
        const pid = parseInt(pidStr, 10);
        result.set(session, { command, pid: Number.isNaN(pid) ? 0 : pid });
      }
    }
    return result;
  } catch {
    return new Map();
  }
};

const SAFE_SHELLS = new Set(['bash', 'zsh', 'fish', 'sh', 'dash']);

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
