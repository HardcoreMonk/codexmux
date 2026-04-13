import type { NextApiRequest, NextApiResponse } from 'next';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('hooks');

const isLocalRequest = (req: NextApiRequest): boolean => {
  const ip = req.socket.remoteAddress;
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const { event, session, notificationType } = req.body ?? {};
  if (typeof event === 'string' && event !== 'poll' && typeof session === 'string' && session) {
    const type = typeof notificationType === 'string' && notificationType ? notificationType : undefined;
    log.debug({ event, session, notificationType: type }, `received ${event}${type ? `(${type})` : ''}`);
    getStatusManager().updateTabFromHook(session, event, type);
  } else {
    log.debug({ body: req.body }, 'poll trigger');
    getStatusManager().poll().catch((err) => {
      log.error({ err }, 'Poll trigger failed');
    });
  }

  return res.status(204).end();
};

export default handler;
