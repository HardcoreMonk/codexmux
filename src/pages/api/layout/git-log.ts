import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { getSessionCwd, hasSession } from '@/lib/tmux';
import { getCommitLog } from '@/lib/git-log';
import { createLogger } from '@/lib/logger';

const execFile = promisify(execFileCb);
const log = createLogger('git-log');
const CMD_TIMEOUT = 5000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 500;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  const limitParam = parseInt(req.query.limit as string, 10);
  const limit = Math.min(Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT, MAX_LIMIT);

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
    await execFile('git', ['-C', cwd, 'rev-parse', '--is-inside-work-tree'], { timeout: CMD_TIMEOUT });
  } catch {
    return res.status(200).json({ isGitRepo: false, commits: [] });
  }

  try {
    const result = await getCommitLog(cwd, limit);
    return res.status(200).json({ isGitRepo: true, ...result });
  } catch (err) {
    log.error(`git log failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to get commit log' });
  }
};

export default handler;
