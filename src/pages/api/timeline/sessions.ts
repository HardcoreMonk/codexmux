import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession } from '@/lib/tmux';
import { listSessions } from '@/lib/session-list';

const DEFAULT_LIMIT = 50;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tmuxSession = req.query.tmuxSession as string | undefined;
  if (!tmuxSession) {
    return res.status(400).json({ error: 'missing-param', message: 'tmuxSession parameter required' });
  }

  const exists = await hasSession(tmuxSession);
  if (!exists) {
    return res.status(404).json({ error: 'tmux-session-not-found', message: `tmux session '${tmuxSession}' not found` });
  }

  const limit = Math.max(1, parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT);
  const offset = Math.max(0, parseInt(req.query.offset as string, 10) || 0);

  const cwdHint = req.query.cwd as string | undefined;

  try {
    const allSessions = await listSessions(tmuxSession, cwdHint);
    const total = allSessions.length;
    const sliced = allSessions.slice(offset, offset + limit);
    const hasMore = offset + limit < total;

    return res.status(200).json({ sessions: sliced, total, hasMore });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message === 'cwd-lookup-failed') {
      return res.status(500).json({ error: 'cwd-lookup-failed', message: 'Failed to get cwd from tmux session' });
    }
    return res.status(500).json({ error: 'internal-error', message });
  }
};

export default handler;
