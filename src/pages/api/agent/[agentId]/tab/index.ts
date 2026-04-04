import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { ICreateTabRequest } from '@/types/agent';

const log = createLogger('api:agent-tab');

const isLocalRequest = (req: NextApiRequest): boolean => {
  const host = req.headers.host || '';
  return host.startsWith('localhost:') || host.startsWith('127.0.0.1:');
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
  const { workspaceId, taskTitle } = req.body as Partial<ICreateTabRequest>;

  if (!workspaceId) {
    return res.status(400).json({ error: 'workspaceId is required' });
  }

  try {
    const tab = await getAgentManager().createTab(agentId, workspaceId, taskTitle);
    return res.status(201).json({
      tabId: tab.tabId,
      workspaceId: tab.workspaceId,
      tmuxSession: tab.tmuxSession,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';

    if (msg === 'Agent not found') {
      return res.status(404).json({ error: msg });
    }
    if (msg === 'Workspace not found') {
      const available = (err as Error & { available?: unknown[] }).available;
      return res.status(400).json({ error: msg, available });
    }
    if (msg === 'Max concurrent tabs reached') {
      const limit = (err as Error & { limit?: number }).limit;
      return res.status(429).json({ error: msg, limit });
    }

    log.error(`create tab failed: ${msg}`);
    return res.status(500).json({ error: 'Failed to create tab session' });
  }
};

export default handler;
