import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile as execFileCb } from 'child_process';
import { createHash } from 'crypto';
import { promisify } from 'util';
import { getSessionCwd, hasSession } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';

const execFile = promisify(execFileCb);
const log = createLogger('diff');
const CMD_TIMEOUT = 10000;

const getAheadBehind = async (cwd: string): Promise<{ ahead: number; behind: number }> => {
  try {
    const { stdout } = await execFile(
      'git',
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      { cwd, timeout: CMD_TIMEOUT },
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

interface IHeadCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  timestamp: number;
}

interface IRepoMeta {
  branch: string;
  upstream: string | null;
  isDetached: boolean;
  stash: number;
  headCommit: IHeadCommit | null;
}

const FIELD = '\x1f';

const getRepoMeta = async (cwd: string): Promise<IRepoMeta> => {
  const [branchRes, upstreamRes, stashRes, headRes] = await Promise.allSettled([
    execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, timeout: CMD_TIMEOUT }),
    execFile('git', ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { cwd, timeout: CMD_TIMEOUT }),
    execFile('git', ['stash', 'list'], { cwd, timeout: CMD_TIMEOUT }),
    execFile('git', ['log', '-1', `--format=%H${FIELD}%s${FIELD}%an${FIELD}%at`], { cwd, timeout: CMD_TIMEOUT }),
  ]);

  const branch = branchRes.status === 'fulfilled' ? branchRes.value.stdout.trim() : '';
  const upstream = upstreamRes.status === 'fulfilled' ? upstreamRes.value.stdout.trim() : null;
  const stashOut = stashRes.status === 'fulfilled' ? stashRes.value.stdout.trim() : '';
  const stash = stashOut ? stashOut.split('\n').length : 0;

  let headCommit: IHeadCommit | null = null;
  if (headRes.status === 'fulfilled') {
    const parts = headRes.value.stdout.trim().split(FIELD);
    if (parts.length >= 4) {
      const [hash, subject, author, ts] = parts;
      headCommit = {
        hash,
        shortHash: hash.slice(0, 7),
        subject,
        author,
        timestamp: parseInt(ts, 10) * 1000,
      };
    }
  }

  return {
    branch,
    upstream,
    isDetached: branch === 'HEAD',
    stash,
    headCommit,
  };
};

const computeDiffHash = async (cwd: string) => {
  const [{ stdout: headOut }, { stdout: statusOut }, { stdout: shortstatOut }] = await Promise.all([
    execFile('git', ['rev-parse', 'HEAD'], { cwd, timeout: CMD_TIMEOUT }),
    execFile('git', ['status', '--porcelain', '-uall'], { cwd, timeout: CMD_TIMEOUT }),
    execFile('git', ['diff', 'HEAD', '--shortstat'], { cwd, timeout: CMD_TIMEOUT }),
  ]);
  return createHash('sha1')
    .update(`${headOut.trim()}\n${statusOut}\n${shortstatOut}`)
    .digest('hex')
    .slice(0, 16);
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  const hashOnly = req.query.hashOnly === 'true';

  if (!session) {
    return res.status(400).json({ error: 'session parameter required' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const cwd = await getSessionCwd(session);
  if (!cwd) {
    return res.status(500).json({ error: 'Failed to get CWD' });
  }

  try {
    await execFile('git', ['rev-parse', '--is-inside-work-tree'], { cwd, timeout: CMD_TIMEOUT });
  } catch {
    return res.status(200).json({ isGitRepo: false, diff: '', hash: '' });
  }

  try {
    if (hashOnly) {
      const hash = await computeDiffHash(cwd);
      return res.status(200).json({ isGitRepo: true, hash });
    }

    const [{ stdout: diff }, { stdout: statusOut }, hash, aheadBehind, meta] = await Promise.all([
      execFile('git', ['diff', 'HEAD'], { cwd, timeout: CMD_TIMEOUT, maxBuffer: 5 * 1024 * 1024 }),
      execFile('git', ['status', '--porcelain', '-uall'], { cwd, timeout: CMD_TIMEOUT }),
      computeDiffHash(cwd),
      getAheadBehind(cwd),
      getRepoMeta(cwd),
    ]);

    const untrackedFiles = statusOut
      .split('\n')
      .filter((line) => line.startsWith('??'))
      .map((line) => line.slice(3).trim());

    let fullDiff = diff;
    for (const file of untrackedFiles) {
      try {
        const { stdout: fileDiff } = await execFile('git', ['diff', '--no-index', '/dev/null', file], { cwd, timeout: CMD_TIMEOUT });
        fullDiff += fileDiff;
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'stdout' in err) {
          fullDiff += (err as { stdout: string }).stdout;
        }
      }
    }

    return res.status(200).json({
      isGitRepo: true,
      diff: fullDiff,
      hash,
      ahead: aheadBehind.ahead,
      behind: aheadBehind.behind,
      branch: meta.branch,
      upstream: meta.upstream,
      isDetached: meta.isDetached,
      stash: meta.stash,
      headCommit: meta.headCommit,
    });
  } catch (err) {
    log.error(`git diff failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to get diff' });
  }
};

export default handler;
