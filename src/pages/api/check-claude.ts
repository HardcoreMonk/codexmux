import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionPanePid, hasSession } from '@/lib/tmux';
import { isClaudeRunning } from '@/lib/session-detection';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  if (!session) {
    return res.status(400).json({ error: 'session parameter required' });
  }

  const checkedAt = Date.now();

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(200).json({ running: false, checkedAt });
  }

  const panePid = await getSessionPanePid(session);
  if (!panePid) {
    return res.status(200).json({ running: false, checkedAt });
  }

  const running = await isClaudeRunning(panePid);
  return res.status(200).json({ running, checkedAt });
};

export default handler;
