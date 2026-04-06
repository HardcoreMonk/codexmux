import type { NextApiRequest, NextApiResponse } from 'next';
import { getGitStatus } from '@/lib/git-status';
import { createLogger } from '@/lib/logger';

const log = createLogger('git');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tmuxSession = req.query.tmuxSession as string | undefined;
  if (!tmuxSession) {
    return res.status(400).json({ error: 'missing-param', message: 'tmuxSession parameter required' });
  }

  try {
    const status = await getGitStatus(tmuxSession);
    return res.status(200).json({ status });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message === 'tmux-session-not-found') {
      return res.status(404).json({ error: 'tmux-session-not-found' });
    }

    log.error(`status query failed: ${message}`);
    return res.status(500).json({ error: 'git-error' });
  }
};

export default handler;
