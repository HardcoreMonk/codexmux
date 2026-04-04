import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { IAgentWorkspaceResponse } from '@/types/agent';

const log = createLogger('api:agent-workspace');

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
    const workspace = await manager.getWorkspace(agentId);
    if (!workspace) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const response: IAgentWorkspaceResponse = workspace;
    return res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error(`fetch workspace failed: ${message}`);
    return res.status(500).json({ error: 'Failed to fetch workspace' });
  }
};

export default handler;
