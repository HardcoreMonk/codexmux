import { execFile as execFileCb, execFileSync } from 'child_process';
import { access } from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import type { IRuntimePreflightResult } from '@/types/preflight';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5000;

const resolveShellPath = (): string => {
  const shell = os.userInfo().shell || process.env.SHELL || '/bin/zsh';
  try {
    const stdout = execFileSync(shell, ['-ilc', 'echo -n "$PATH"'], {
      timeout: CMD_TIMEOUT,
      env: { NODE_ENV: process.env.NODE_ENV, DISABLE_AUTO_UPDATE: 'true', ZSH_TMUX_AUTOSTARTED: 'true' },
    });
    return stdout.toString().trim();
  } catch {
    return process.env.PATH || '';
  }
};

export let shellPath = resolveShellPath();
const MIN_TMUX_VERSION = 2.9;

interface IToolStatus {
  installed: boolean;
  version: string | null;
}

interface IPreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  claude: IToolStatus & { binaryPath: string | null; loggedIn: boolean };
  brew: IToolStatus;
  clt: { installed: boolean };
}

const checkTool = async (
  cmd: string,
  args: string[],
  parseVersion: (stdout: string) => string | null,
): Promise<IToolStatus> => {
  try {
    const { stdout } = await execFile(cmd, args, { timeout: CMD_TIMEOUT, env: { ...process.env, PATH: shellPath } });
    return { installed: true, version: parseVersion(stdout) };
  } catch {
    return { installed: false, version: null };
  }
};

const parseSemanticVersion = (stdout: string): string | null =>
  stdout.trim().match(/(\d+\.\d+[\d.]*)/)?.[1] ?? null;

const CLAUDE_KNOWN_DIRS = [path.join(os.homedir(), '.local', 'bin')];

const findClaudeBinary = async (): Promise<string | null> => {
  for (const dir of CLAUDE_KNOWN_DIRS) {
    try {
      await access(path.join(dir, 'claude'));
      return dir;
    } catch {
      // not found
    }
  }
  return null;
};

const isTmuxCompatible = (tool: IToolStatus): boolean =>
  tool.installed && tool.version !== null && parseFloat(tool.version) >= MIN_TMUX_VERSION;

const checkClt = async (): Promise<{ installed: boolean }> => {
  try {
    await execFile('xcode-select', ['-p'], { timeout: CMD_TIMEOUT });
    return { installed: true };
  } catch {
    return { installed: false };
  }
};

export const getPreflightStatus = async (): Promise<IPreflightResult> => {
  shellPath = resolveShellPath();
  const [tmux, git, claude, brew, clt] = await Promise.all([
    checkTool('tmux', ['-V'], parseSemanticVersion),
    checkTool('git', ['--version'], parseSemanticVersion),
    checkTool('claude', ['--version'], parseSemanticVersion),
    checkTool('brew', ['--version'], parseSemanticVersion),
    checkClt(),
  ]);

  const claudeBinaryPath = claude.installed ? null : await findClaudeBinary();
  let claudeLoggedIn = false;
  if (claude.installed || claudeBinaryPath) {
    try {
      await access(path.join(os.homedir(), '.claude'));
      claudeLoggedIn = true;
    } catch {
      // not logged in yet
    }
  }

  return {
    tmux: { ...tmux, compatible: isTmuxCompatible(tmux) },
    git,
    claude: { ...claude, binaryPath: claudeBinaryPath, loggedIn: claudeLoggedIn },
    brew,
    clt,
  };
};

const RUNTIME_CACHE_TTL = 30_000;
let runtimeCache: { result: IRuntimePreflightResult; checkedAt: number } | null = null;
let inflightRequest: Promise<IRuntimePreflightResult> | null = null;

export const getRuntimePreflightStatus = async (): Promise<IRuntimePreflightResult> => {
  shellPath = resolveShellPath();
  const [tmux, git, claude] = await Promise.all([
    checkTool('tmux', ['-V'], parseSemanticVersion),
    checkTool('git', ['--version'], parseSemanticVersion),
    checkTool('claude', ['--version'], parseSemanticVersion),
  ]);

  return {
    tmux: { ...tmux, compatible: isTmuxCompatible(tmux) },
    git,
    claude,
  };
};

export const getCachedRuntimePreflight = async (): Promise<IRuntimePreflightResult> => {
  if (runtimeCache && Date.now() - runtimeCache.checkedAt < RUNTIME_CACHE_TTL) {
    return runtimeCache.result;
  }
  if (inflightRequest) return inflightRequest;

  inflightRequest = getRuntimePreflightStatus()
    .then((result) => {
      runtimeCache = { result, checkedAt: Date.now() };
      inflightRequest = null;
      return result;
    })
    .catch((err) => {
      inflightRequest = null;
      throw err;
    });

  return inflightRequest;
};

export const invalidateRuntimeCache = (): void => {
  runtimeCache = null;
  inflightRequest = null;
};
