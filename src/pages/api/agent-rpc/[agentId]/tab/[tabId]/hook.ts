import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:agent-tab-hook');

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

  const agentId = req.query.agentId as string;
  const tabId = req.query.tabId as string;

  try {
    await getAgentManager().onTabHook(agentId, tabId);
  } catch (err) {
    log.error(`tab hook failed: ${err instanceof Error ? err.message : err}`);
  }

  return res.status(204).end();
};

export default handler;
