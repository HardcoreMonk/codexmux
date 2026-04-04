import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { ITabSendRequest } from '@/types/agent';

const log = createLogger('api:agent-tab-send');

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
  const tabId = req.query.tabId as string;
  const { content } = req.body as Partial<ITabSendRequest>;

  if (!content) {
    return res.status(400).json({ error: 'content is required' });
  }

  try {
    const result = await getAgentManager().sendToTab(agentId, tabId, content);
    return res.status(200).json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';

    if (msg === 'Tab not found') return res.status(404).json({ error: msg });
    if (msg === 'Agent not found') return res.status(404).json({ error: msg });
    if (msg === 'Tab not owned by this agent') return res.status(403).json({ error: msg });
    if (msg === 'Tab session is dead') return res.status(410).json({ error: msg });

    log.error(`send to tab failed: ${msg}`);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

export default handler;
