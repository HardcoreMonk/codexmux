import type { NextApiRequest, NextApiResponse } from 'next';
import { capturePaneContent, hasSession } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';

const log = createLogger('tmux');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  if (!session) {
    return res.status(400).json({ error: 'session parameter required' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    const content = await capturePaneContent(session);
    return res.status(200).json({ content: content ?? '' });
  } catch (err) {
    log.error(`capture failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to capture pane' });
  }
};

export default handler;
