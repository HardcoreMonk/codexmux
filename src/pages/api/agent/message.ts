import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';
import type { IAgentMessageRequest } from '@/types/agent';

const log = createLogger('api:agent-message');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId, type, content, metadata } = req.body as Partial<IAgentMessageRequest>;

  if (!agentId || !type || !content) {
    return res.status(400).json({ error: 'agentId, type, content 필수' });
  }

  const validTypes = new Set(['report', 'question', 'done', 'error', 'approval']);
  if (!validTypes.has(type)) {
    return res.status(400).json({ error: `invalid type: ${type}` });
  }

  try {
    const message = await getAgentManager().receiveAgentMessage(agentId, type, content, metadata);
    return res.status(200).json({ id: message.id, received: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown error';
    if (msg === 'Agent not found') {
      return res.status(404).json({ error: msg });
    }
    log.error(`receive agent message failed: ${msg}`);
    return res.status(500).json({ error: 'Failed to process message' });
  }
};

export default handler;
