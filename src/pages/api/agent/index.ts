import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { ICreateAgentRequest } from '@/types/agent';

const log = createLogger('api:agent');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const manager = getAgentManager();

  if (req.method === 'GET') {
    const agents = manager.listAgents().map(({ id, name, role, projects, status }) => ({
      id,
      name,
      role,
      projects,
      status,
    }));
    return res.status(200).json({ agents });
  }

  if (req.method === 'POST') {
    const { name, role, projects } = req.body as Partial<ICreateAgentRequest>;
    if (!name || !role || !projects?.length) {
      return res.status(400).json({ error: 'name, role, projects 필수' });
    }

    try {
      const info = await manager.createAgent(name, role, projects);
      return res.status(201).json({
        id: info.id,
        name: info.name,
        role: info.role,
        projects: info.projects,
        status: info.status,
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
