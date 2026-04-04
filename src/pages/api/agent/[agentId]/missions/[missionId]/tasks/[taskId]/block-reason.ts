import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:block-reason');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId, missionId, taskId } = req.query as {
    agentId: string;
    missionId: string;
    taskId: string;
  };

  const manager = getAgentManager();
  const agent = manager.getAgent(agentId);

  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  try {
    const reason = manager.getBlockReason(agentId, missionId, taskId);
    if (!reason) {
      return res.status(404).json({ error: 'Block reason not found' });
    }
    return res.status(200).json(reason);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error(`fetch block reason failed: ${message}`);
    return res.status(500).json({ error: 'Failed to fetch block reason' });
  }
};

export default handler;
