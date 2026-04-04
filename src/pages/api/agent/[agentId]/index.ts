import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { IUpdateAgentRequest } from '@/types/agent';

const log = createLogger('api:agent-detail');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const { agentId } = req.query as { agentId: string };
  const manager = getAgentManager();

  if (req.method === 'GET') {
    const agent = manager.getAgent(agentId);
    if (!agent) return res.status(404).json({ error: 'Agent not found' });

    return res.status(200).json({
      id: agent.id,
      name: agent.name,
      role: agent.role,
      projects: agent.projects,
      status: agent.status,
      createdAt: agent.createdAt,
    });
  }

  if (req.method === 'PATCH') {
    const update = req.body as Partial<IUpdateAgentRequest>;

    try {
      const agent = await manager.updateAgent(agentId, update);
      if (!agent) return res.status(404).json({ error: 'Agent not found' });

      return res.status(200).json({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        projects: agent.projects,
        status: agent.status,
        createdAt: agent.createdAt,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      if (message === 'Agent name already exists') {
        return res.status(409).json({ error: message });
      }
      log.error(`agent update failed: ${message}`);
      return res.status(500).json({ error: 'Failed to update agent' });
    }
  }

  if (req.method === 'DELETE') {
    const deleted = await manager.deleteAgent(agentId);
    if (!deleted) return res.status(404).json({ error: 'Agent not found' });
    return res.status(204).end();
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
