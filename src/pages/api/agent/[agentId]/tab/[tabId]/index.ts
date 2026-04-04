import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:agent-tab-close');

const isLocalRequest = (req: NextApiRequest): boolean => {
  const host = req.headers.host || '';
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isLocalRequest(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const agentId = req.query.agentId as string;
  const tabId = req.query.tabId as string;

  try {
    await getAgentManager().closeTab(agentId, tabId);
    return res.status(204).end();
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';

    if (msg === 'Agent not found' || msg === 'Tab not found') {
      return res.status(404).json({ error: msg });
    }

    log.error(`close tab failed: ${msg}`);
    return res.status(500).json({ error: 'Failed to close tab' });
  }
};

export default handler;
