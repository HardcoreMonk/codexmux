import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { nanoid } from 'nanoid';

const execFile = promisify(execFileCb);

const TMUX_SOCKET = 'purple';
const TMUX_CONFIG_PATH = path.join(process.cwd(), 'src', 'config', 'tmux.conf');
const CMD_TIMEOUT = 5000;

export const checkTmux = async (): Promise<{ version: string }> => {
  try {
    const { stdout } = await execFile('tmux', ['-V'], { timeout: CMD_TIMEOUT });
    const match = stdout.trim().match(/(\d+\.\d+)/);
    if (!match) {
      console.log('[terminal] tmux version could not be parsed');
      process.exit(1);
    }
    const version = match[1];
    if (parseFloat(version) < 2.9) {
      console.log(`[terminal] tmux version ${version} < 2.9, exiting`);
      process.exit(1);
    }
    console.log(`[terminal] tmux version: ${version} (>= 2.9 required)`);
    return { version };
  } catch {
    console.log('[terminal] tmux not found or version < 2.9, exiting');
    process.exit(1);
  }
};

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

export const killSession = async (name: string): Promise<void> => {
  await execFile(
    'tmux',
    ['-L', TMUX_SOCKET, 'kill-session', '-t', name],
    { timeout: CMD_TIMEOUT },
  );
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

export interface ISessionInfo {
  command: string;
  cwd: string;
}

export const getSessionsInfo = async (): Promise<Map<string, ISessionInfo>> => {
  try {
    const { stdout } = await execFile(
      'tmux',
      ['-L', TMUX_SOCKET, 'list-panes', '-a', '-F', '#{session_name}\t#{pane_current_command}\t#{pane_current_path}'],
      { timeout: CMD_TIMEOUT },
    );
    const result = new Map<string, ISessionInfo>();
    for (const line of stdout.trim().split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        result.set(parts[0], { command: parts[1], cwd: parts[2] });
      }
    }
    return result;
  } catch {
    return new Map();
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

export const defaultSessionName = (): string =>
  `pt-${nanoid(6)}-${nanoid(6)}-${nanoid(6)}`;

export const workspaceSessionName = (wsId: string, paneId: string, tabId: string): string =>
  `pt-${wsId}-${paneId}-${tabId}`;
