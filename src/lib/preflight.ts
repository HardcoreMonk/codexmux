import { execFile as execFileCb, execFileSync } from 'child_process';
import os from 'os';
import { promisify } from 'util';

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
  claude: IToolStatus;
  brew: IToolStatus;
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

export const getPreflightStatus = async (): Promise<IPreflightResult> => {
  shellPath = resolveShellPath();
  const [tmux, git, claude, brew] = await Promise.all([
    checkTool('tmux', ['-V'], parseSemanticVersion),
    checkTool('git', ['--version'], parseSemanticVersion),
    checkTool('claude', ['--version'], parseSemanticVersion),
    checkTool('brew', ['--version'], parseSemanticVersion),
  ]);

  return {
    tmux: {
      ...tmux,
      compatible: tmux.installed && tmux.version !== null && parseFloat(tmux.version) >= MIN_TMUX_VERSION,
    },
    git,
    claude,
    brew,
  };
};
