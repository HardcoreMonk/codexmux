import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getSessionCwd } from '@/lib/tmux';
import { getCached, setCached } from '@/lib/stats/cache';

const execFile = promisify(execFileCb);

const CMD_TIMEOUT = 5000;
const GIT_BRANCH_TTL = 15_000;

export const getGitBranch = async (
  tmuxSession: string,
  options: { force?: boolean } = {},
): Promise<string | null> => {
  const cwd = await getSessionCwd(tmuxSession);
  if (!cwd) {
    throw new Error('tmux-session-not-found');
  }

  const cacheKey = `git-branch:${cwd}`;
  if (!options.force) {
    const cached = getCached<string | null>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'],
      { timeout: CMD_TIMEOUT },
    );
    const branch = stdout.trim() || null;
    setCached(cacheKey, branch, GIT_BRANCH_TTL);
    return branch;
  } catch (err: unknown) {
    const exitCode = (err as { code?: number }).code;
    if (exitCode === 128) {
      setCached(cacheKey, null, GIT_BRANCH_TTL);
      return null;
    }
    throw err;
  }
};
