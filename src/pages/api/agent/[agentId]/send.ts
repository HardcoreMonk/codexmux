import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:agent-send');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId } = req.query as { agentId: string };
  const { content } = req.body as { content?: string };

  if (!content) {
    return res.status(400).json({ error: 'content 필수' });
  }

  try {
    const result = await getAgentManager().sendMessage(agentId, content);
    return res.status(200).json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    if (message === 'Agent not found') {
      return res.status(404).json({ error: message });
    }
    if (message === 'Message queue full') {
      return res.status(429).json({ error: message });
    }
    log.error(`send message failed: ${message}`);
    return res.status(500).json({ error: 'Failed to send message' });
  }
};

export default handler;
