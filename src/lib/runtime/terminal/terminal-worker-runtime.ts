import { execFile as execFileCb } from 'child_process';
import * as pty from 'node-pty';
import { promisify } from 'util';
import { parseRuntimeSessionName } from '@/lib/runtime/session-name';
import type { ITerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-service';
import { resolveRuntimeTmuxConfigPath } from '@/lib/runtime/worker-paths';
import { buildShellEnv, buildShellLaunchCommand } from '@/lib/shell-env';
import { PRISTINE_ENV } from '@/lib/pristine-env';

const execFile = promisify(execFileCb);
const RUNTIME_TMUX_SOCKET = 'codexmux-runtime-v2';
const CMD_TIMEOUT = 5000;

interface IAttachedPty {
  pty: pty.IPty;
  disposables: pty.IDisposable[];
}

const assertRuntimeSessionName = (sessionName: string): void => {
  parseRuntimeSessionName(sessionName);
};

const createRuntimeError = (
  code: string,
  message: string,
  err: unknown,
): Error & { code: string; retryable: false } => (
  Object.assign(new Error(`${message}: ${err instanceof Error ? err.message : String(err)}`), {
    code,
    retryable: false as const,
  })
);

const sourceRuntimeTmuxConfig = async (): Promise<void> => {
  const tmuxConfigPath = resolveRuntimeTmuxConfigPath();
  try {
    await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'source-file', tmuxConfigPath], {
      timeout: CMD_TIMEOUT,
    });
  } catch (err) {
    throw createRuntimeError(
      'runtime-v2-tmux-config-source-failed',
      `Runtime v2 tmux config could not be sourced: ${tmuxConfigPath}`,
      err,
    );
  }
};

const killRuntimeSession = async (sessionName: string): Promise<void> => {
  assertRuntimeSessionName(sessionName);
  await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'kill-session', '-t', sessionName], {
    timeout: CMD_TIMEOUT,
  }).catch(() => undefined);
};

const createRuntimeSession = async (input: {
  sessionName: string;
  cols: number;
  rows: number;
  cwd?: string;
}): Promise<void> => {
  assertRuntimeSessionName(input.sessionName);
  await execFile(
    'tmux',
    [
      '-u',
      '-L',
      RUNTIME_TMUX_SOCKET,
      '-f',
      resolveRuntimeTmuxConfigPath(),
      'new-session',
      '-d',
      '-s',
      input.sessionName,
      '-x',
      String(input.cols),
      '-y',
      String(input.rows),
      buildShellLaunchCommand(),
    ],
    {
      timeout: CMD_TIMEOUT,
      cwd: input.cwd || PRISTINE_ENV.HOME || '/',
    },
  );
  try {
    await sourceRuntimeTmuxConfig();
  } catch (err) {
    await killRuntimeSession(input.sessionName);
    throw err;
  }
};

const assertRuntimeSessionExists = async (sessionName: string): Promise<void> => {
  assertRuntimeSessionName(sessionName);
  try {
    await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'has-session', '-t', sessionName], {
      timeout: CMD_TIMEOUT,
    });
  } catch (err) {
    throw createRuntimeError(
      'runtime-v2-terminal-session-not-found',
      `Runtime v2 tmux session not found: ${sessionName}`,
      err,
    );
  }
};

export const createTerminalWorkerRuntime = (): ITerminalWorkerRuntime => {
  const attached = new Map<string, IAttachedPty>();

  const detachSession = async (sessionName: string) => {
    const current = attached.get(sessionName);
    if (!current) return { sessionName, detached: false };
    current.disposables.forEach((disposable) => disposable.dispose());
    current.pty.kill();
    attached.delete(sessionName);
    return { sessionName, detached: true };
  };

  return {
    async health() {
      return { ok: true, attached: attached.size };
    },

    async createSession(input) {
      await createRuntimeSession(input);
      return { sessionName: input.sessionName };
    },

    async attach(sessionName, cols, rows, onData) {
      assertRuntimeSessionName(sessionName);
      if (attached.has(sessionName)) return { sessionName, attached: true };
      await assertRuntimeSessionExists(sessionName);
      const ptyProcess = pty.spawn('tmux', ['-u', '-L', RUNTIME_TMUX_SOCKET, 'attach-session', '-t', sessionName], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: PRISTINE_ENV.HOME || '/',
        env: buildShellEnv(),
      });
      const disposables = [ptyProcess.onData(onData)];
      attached.set(sessionName, { pty: ptyProcess, disposables });
      return { sessionName, attached: true };
    },

    async detach(sessionName) {
      return detachSession(sessionName);
    },

    async killSession(sessionName) {
      await detachSession(sessionName);
      await killRuntimeSession(sessionName);
      return { sessionName, killed: true };
    },

    async writeStdin(sessionName, data) {
      const current = attached.get(sessionName);
      if (!current) throw new Error(`session is not attached: ${sessionName}`);
      current.pty.write(data);
      return { written: data.length };
    },

    async resize(sessionName, cols, rows) {
      const current = attached.get(sessionName);
      if (!current) throw new Error(`session is not attached: ${sessionName}`);
      current.pty.resize(cols, rows);
      return { sessionName, cols, rows };
    },
  };
};
