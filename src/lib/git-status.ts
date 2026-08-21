import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getSessionCwd } from '@/lib/tmux';
import { getCached, setCached } from '@/lib/stats/cache';

const execFile = promisify(execFileCb);

const CMD_TIMEOUT = 5000;

export interface IGitCommit {
  hash: string;
  shortHash: string;
  author: string;
  timestamp: number;
  subject: string;
  isMerge: boolean;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface IGitStatus {
  staged: number;
  modified: number;
  untracked: number;
  ahead: number;
  behind: number;
  stash: number;
  insertions: number;
  deletions: number;
  recentCommits: IGitCommit[];
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

const getDiffStats = async (cwd: string): Promise<Pick<IGitStatus, 'insertions' | 'deletions'>> => {
  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'diff', '--numstat'],
      { timeout: CMD_TIMEOUT },
    );
    let insertions = 0;
    let deletions = 0;
    for (const line of stdout.split('\n')) {
      if (!line) continue;
      const [add, del] = line.split('\t');
      if (add === '-' || del === '-') continue; // binary
      insertions += parseInt(add, 10) || 0;
      deletions += parseInt(del, 10) || 0;
    }
    return { insertions, deletions };
  } catch {
    return { insertions: 0, deletions: 0 };
  }
};

const COMMIT_DELIMITER = '__COMMIT__';
const SHORTSTAT_RE = /(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

const getRecentCommits = async (cwd: string, count = 3): Promise<IGitCommit[]> => {
  try {
    const { stdout } = await execFile(
      'git',
      [
        '-C',
        cwd,
        'log',
        `-${count}`,
        `--format=${COMMIT_DELIMITER}%H|%an|%at|%P|%s`,
        '--shortstat',
      ],
      { timeout: CMD_TIMEOUT },
    );

    const blocks = stdout
      .split(COMMIT_DELIMITER)
      .map((b) => b.trim())
      .filter(Boolean);

    return blocks.map((block) => {
      const [header, statLine] = block.split('\n').map((s) => s.trim());
      const [hash, author, timestampStr, parents, ...subjectParts] = header.split('|');
      const subject = subjectParts.join('|');
      const isMerge = parents.trim().split(/\s+/).length > 1;

      let filesChanged = 0;
      let insertions = 0;
      let deletions = 0;
      if (statLine) {
        const m = statLine.match(SHORTSTAT_RE);
        if (m) {
          filesChanged = parseInt(m[1], 10) || 0;
          insertions = parseInt(m[2], 10) || 0;
          deletions = parseInt(m[3], 10) || 0;
        }
      }

      return {
        hash,
        shortHash: hash.slice(0, 7),
        author,
        timestamp: parseInt(timestampStr, 10) * 1000,
        subject,
        isMerge,
        filesChanged,
        insertions,
        deletions,
      };
    });
  } catch {
    return [];
  }
};

const GIT_STATUS_TTL = 15_000;

export const getGitStatus = async (
  tmuxSession: string,
  options: { force?: boolean } = {},
): Promise<IGitStatus | null> => {
  const cwd = await getSessionCwd(tmuxSession);
  if (!cwd) {
    throw new Error('tmux-session-not-found');
  }

  const cacheKey = `git-status:${cwd}`;
  if (!options.force) {
    const cached = getCached<IGitStatus | null>(cacheKey);
    if (cached !== null) return cached;
  }

  try {
    const { stdout } = await execFile(
      'git',
      ['-C', cwd, 'status', '--porcelain'],
      { timeout: CMD_TIMEOUT },
    );

    const porcelain = parsePortcelain(stdout);
    const [aheadBehind, stash, diffStats, recentCommits] = await Promise.all([
      getAheadBehind(cwd),
      getStashCount(cwd),
      getDiffStats(cwd),
      getRecentCommits(cwd),
    ]);

    const status: IGitStatus = {
      ...porcelain,
      ...aheadBehind,
      stash,
      ...diffStats,
      recentCommits,
    };
    setCached(cacheKey, status, GIT_STATUS_TTL);
    return status;
  } catch (err: unknown) {
    const exitCode = (err as { code?: number }).code;
    if (exitCode === 128) {
      setCached(cacheKey, null, GIT_STATUS_TTL);
      return null;
    }
    throw err;
  }
};
