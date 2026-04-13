import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionPanePid, hasSession } from '@/lib/tmux';
import { detectActiveSession, getChildPids, isClaudeRunning } from '@/lib/session-detection';

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
    return res.status(200).json({ running: false, checkedAt, sessionId: null });
  }

  const panePid = await getSessionPanePid(session);
  if (!panePid) {
    return res.status(200).json({ running: false, checkedAt, sessionId: null });
  }

  const childPids = await getChildPids(panePid);
  const running = await isClaudeRunning(panePid, childPids);
  if (!running) {
    return res.status(200).json({ running: false, checkedAt, sessionId: null });
  }

  const info = await detectActiveSession(panePid, childPids);
  return res.status(200).json({ running: true, checkedAt, sessionId: info.sessionId });
};

export default handler;
