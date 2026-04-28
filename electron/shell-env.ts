// Resolve user's login shell environment when Electron is launched from
// Finder/Dock — launchd gives a minimal env with no PATH/LANG/XDG/HOMEBREW,
// which breaks subsequent shell spawns. Mirrors VSCode's approach in
// src/vs/platform/shell/node/shellEnv.ts.

import { spawn } from 'child_process';
import { basename } from 'path';
import { randomUUID } from 'crypto';
import { userInfo } from 'os';

const RESOLVE_TIMEOUT_MS = 10000;

const BROKEN_SHELL = '/bin/false';
const FALLBACK_SHELL_DARWIN = '/bin/zsh';
const FALLBACK_SHELL_OTHER = '/bin/bash';

const SENTINEL_ENV: Record<string, string> = {
  ELECTRON_RUN_AS_NODE: '1',
  ELECTRON_NO_ATTACH_CONSOLE: '1',
  CODEXMUX_RESOLVING_ENV: '1',
};

const STRIP_KEYS = [
  'ELECTRON_RUN_AS_NODE',
  'ELECTRON_NO_ATTACH_CONSOLE',
  'CODEXMUX_RESOLVING_ENV',
  // https://github.com/microsoft/vscode/issues/22593
  'XDG_RUNTIME_DIR',
];

const shouldResolveShellEnv = (): boolean => {
  if (process.platform === 'win32') return false;
  if (process.env.CODEXMUX_CLI === '1') return false;
  if (process.env.CODEXMUX_DISABLE_SHELL_ENV === '1') return false;
  return true;
};

const detectSystemShell = (): string => {
  const envShell = process.env.SHELL;
  if (envShell && envShell !== BROKEN_SHELL) return envShell;

  try {
    const info = userInfo();
    if (info.shell && info.shell !== BROKEN_SHELL) return info.shell;
  } catch {
    // codespaces 등에서 /etc/passwd 없을 때 throw — fallback으로 진행
  }

  return process.platform === 'darwin' ? FALLBACK_SHELL_DARWIN : FALLBACK_SHELL_OTHER;
};

interface IShellInvocation {
  args: string[];
  command: string;
}

const buildShellInvocation = (shellPath: string, mark: string): IShellInvocation => {
  const name = basename(shellPath);
  const nodeBin = `'${process.execPath}'`;
  const defaultCommand = `${nodeBin} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`;

  if (/^(?:pwsh|powershell)(?:-preview)?$/.test(name)) {
    return {
      args: ['-Login', '-Command'],
      command: `& ${nodeBin} -p '''${mark}'' + JSON.stringify(process.env) + ''${mark}'''`,
    };
  }

  if (name === 'nu') {
    return {
      args: ['-i', '-l', '-c'],
      command: `^${nodeBin} -p '"${mark}" + JSON.stringify(process.env) + "${mark}"'`,
    };
  }

  if (name === 'xonsh') {
    return {
      args: ['-i', '-l', '-c'],
      command: `import os, json; print("${mark}", json.dumps(dict(os.environ)), "${mark}")`,
    };
  }

  if (name === 'tcsh' || name === 'csh') {
    return { args: ['-ic'], command: defaultCommand };
  }

  return { args: ['-i', '-l', '-c'], command: defaultCommand };
};

interface ISpawnResult {
  stdout: string;
  stderr: string;
}

const spawnShellCapture = (
  shellPath: string,
  invocation: IShellInvocation,
  timeoutMs: number,
): Promise<ISpawnResult> =>
  new Promise((resolve, reject) => {
    const child = spawn(shellPath, [...invocation.args, invocation.command], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...SENTINEL_ENV },
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch { /* noop */ }
      reject(new Error(`shell env resolve timeout (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout?.on('data', (b: Buffer) => stdoutChunks.push(b));
    child.stderr?.on('data', (b: Buffer) => stderrChunks.push(b));

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0 || signal) {
        reject(new Error(
          `shell exited code=${code} signal=${signal} stderr=${stderr.trim().slice(0, 200)}`,
        ));
        return;
      }
      resolve({ stdout, stderr });
    });
  });

const extractMarkedEnv = (raw: string, mark: string): NodeJS.ProcessEnv => {
  const regex = new RegExp(mark + '({[\\s\\S]*?})' + mark);
  const match = regex.exec(raw);
  if (!match) throw new Error('env marker not found in shell stdout');

  try {
    return JSON.parse(match[1]) as NodeJS.ProcessEnv;
  } catch (err) {
    throw new Error(`env JSON parse failed: ${(err as Error).message}`);
  }
};

const sanitizeResolvedEnv = (env: NodeJS.ProcessEnv): NodeJS.ProcessEnv => {
  for (const key of STRIP_KEYS) delete env[key];
  return env;
};

const resolveShellEnv = async (): Promise<NodeJS.ProcessEnv | null> => {
  if (!shouldResolveShellEnv()) return null;

  const shellPath = detectSystemShell();
  const mark = randomUUID().replace(/-/g, '').slice(0, 12);
  const invocation = buildShellInvocation(shellPath, mark);

  const started = Date.now();
  try {
    const { stdout } = await spawnShellCapture(shellPath, invocation, RESOLVE_TIMEOUT_MS);
    const parsed = extractMarkedEnv(stdout, mark);
    const sanitized = sanitizeResolvedEnv(parsed);
    console.log(
      `[shell-env] resolved shell=${shellPath} keys=${Object.keys(sanitized).length} duration=${Date.now() - started}ms`,
    );
    return sanitized;
  } catch (err) {
    console.warn(
      `[shell-env] resolve failed (shell=${shellPath}, ${Date.now() - started}ms): ${(err as Error).message}`,
    );
    return null;
  }
};

export const applyResolvedShellEnv = async (): Promise<void> => {
  const resolved = await resolveShellEnv();
  if (!resolved) return;
  for (const [key, value] of Object.entries(resolved)) {
    if (value !== undefined) process.env[key] = value;
  }
};
