import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getSessionCwd } from '@/lib/tmux';

const execFile = promisify(execFileCb);

const CMD_TIMEOUT = 5000;

export interface IGitStatus {
  staged: number;
  modified: number;
  untracked: number;
  ahead: number;
  behind: number;
  stash: number;
}

const parsePortcelain = (stdout: string): Pick<IGitStatus, 'staged' | 'modified' | 'untracked'> => {
  let staged = 0;
  let modified = 0;
  let untracked = 0;

  for (const line of stdout.split('\n')) {
    if (!line) continue;
    const x = line[0];
    const y = line[1];

    if (x === '?') {
      untracked++;
    } else {
      if (x && x !== ' ' && x !== '?') staged++;
      if (y && y !== ' ' && y !== '?') modified++;
    }
  }

  return { staged, modified, untracked };
};

const getAheadBehind = async (cwd: string): Promise<Pick<IGitStatus, 'ahead' | 'behind'>> => {
  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { timeout: CMD_TIMEOUT },
    );
    const parts = stdout.trim().split(/\s+/);
    return {
      ahead: parseInt(parts[0], 10) || 0,
      behind: parseInt(parts[1], 10) || 0,
    };
  } catch {
    return { ahead: 0, behind: 0 };
  }
};

const getStashCount = async (cwd: string): Promise<number> => {
  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'stash', 'list'],
      { timeout: CMD_TIMEOUT },
    );
    return stdout.trim() ? stdout.trim().split('\n').length : 0;
  } catch {
    return 0;
  }
};

export const getGitStatus = async (tmuxSession: string): Promise<IGitStatus | null> => {
  const cwd = await getSessionCwd(tmuxSession);
  if (!cwd) {
    throw new Error('tmux-session-not-found');
  }

  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'status', '--porcelain'],
      { timeout: CMD_TIMEOUT },
    );

    const porcelain = parsePortcelain(stdout);
    const [aheadBehind, stash] = await Promise.all([
      getAheadBehind(cwd),
      getStashCount(cwd),
    ]);

    return {
      ...porcelain,
      ...aheadBehind,
      stash,
    };
  } catch (err: unknown) {
    const exitCode = (err as { code?: number }).code;
    if (exitCode === 128) {
      return null;
    }
    throw err;
  }
};
