import type { NextApiRequest, NextApiResponse } from 'next';

import { updateTabUserMessageClaim } from '@/lib/layout-store';
import { createLogger } from '@/lib/logger';
import { requestTimelineSessionClaimRefresh } from '@/lib/timeline-server-state';

const log = createLogger('layout');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { sessionName, message } = req.body ?? {};
  if (typeof sessionName !== 'string' || !sessionName.trim()) {
    return res.status(400).json({ error: 'sessionName must be a string' });
  }
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message must be a string' });
  }

  try {
    await updateTabUserMessageClaim(sessionName, message);
    requestTimelineSessionClaimRefresh(sessionName);
    return res.status(200).json({ ok: true });
  } catch (err) {
    log.error(`session claim update failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to update session claim' });
  }
};

export default handler;
