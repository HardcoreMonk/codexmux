import type { NextApiRequest, NextApiResponse } from 'next';
import { setSessionPushTarget, markVisible } from '@/lib/push-subscriptions';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { endpoint, sessionId } = req.body ?? {};
  if (!endpoint || typeof sessionId !== 'string' || !sessionId) {
    return res.status(400).json({ error: 'Invalid body' });
  }

  setSessionPushTarget(sessionId, endpoint);
  markVisible(endpoint);
  return res.status(200).json({ ok: true });
};

export default handler;
