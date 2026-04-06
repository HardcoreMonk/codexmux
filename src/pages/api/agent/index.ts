import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { ICreateAgentRequest } from '@/types/agent';

const log = createLogger('api:agent');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const manager = getAgentManager();

  if (req.method === 'GET') {
    const agents = manager.listAgents().map(({ id, name, role, status, avatar }) => ({
      id,
      name,
      role,
      status,
      avatar,
    }));
    return res.status(200).json({ agents });
  }

  if (req.method === 'POST') {
    const { name, role, avatar } = req.body as Partial<ICreateAgentRequest>;
    if (!name) {
      return res.status(400).json({ error: 'name is required' });
    }

    try {
      const info = await manager.createAgent(name, role ?? '', avatar);
      return res.status(201).json({
        id: info.id,
        name: info.name,
        role: info.role,
        status: info.status,
        avatar: info.avatar,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      if (message === 'Agent name already exists') {
        return res.status(409).json({ error: message });
      }
      log.error(`agent creation failed: ${message}`);
      return res.status(500).json({ error: 'Failed to create agent session' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
