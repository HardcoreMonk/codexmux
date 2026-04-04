import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { IMissionListResponse } from '@/types/mission';

const log = createLogger('api:agent-missions');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId } = req.query as { agentId: string };
  const manager = getAgentManager();
  const agent = manager.getAgent(agentId);

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  try {
    const missions = manager.getMissions(agentId);
    const response: IMissionListResponse = { missions };
    return res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error(`fetch missions failed: ${message}`);
    return res.status(500).json({ error: 'Failed to fetch missions' });
  }
};

export default handler;
