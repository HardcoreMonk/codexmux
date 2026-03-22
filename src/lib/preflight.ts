import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 5000;
const MIN_TMUX_VERSION = 2.9;

interface IToolStatus {
  installed: boolean;
  version: string | null;
}

interface IPreflightResult {
  tmux: IToolStatus & { compatible: boolean };
  git: IToolStatus;
  claude: IToolStatus;
}

const checkTool = async (
  cmd: string,
  args: string[],
  parseVersion: (stdout: string) => string | null,
): Promise<IToolStatus> => {
  try {
    const { stdout } = await execFile(cmd, args, { timeout: CMD_TIMEOUT });
    return { installed: true, version: parseVersion(stdout) };
  } catch {
    return { installed: false, version: null };
  }
};

const parseSemanticVersion = (stdout: string): string | null =>
  stdout.trim().match(/(\d+\.\d+[\d.]*)/)?.[1] ?? null;

export const getPreflightStatus = async (): Promise<IPreflightResult> => {
  const [tmux, git, claude] = await Promise.all([
    checkTool('tmux', ['-V'], parseSemanticVersion),
    checkTool('git', ['--version'], parseSemanticVersion),
    checkTool('claude', ['--version'], parseSemanticVersion),
  ]);

  return {
    tmux: {
      ...tmux,
      compatible: tmux.installed && tmux.version !== null && parseFloat(tmux.version) >= MIN_TMUX_VERSION,
    },
    git,
    claude,
  };
};
