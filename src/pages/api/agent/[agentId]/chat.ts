import type { NextApiRequest, NextApiResponse } from 'next';
import { getAgentManager } from '@/lib/agent-manager';
import { getLatestSessionId, readMessages } from '@/lib/agent-chat';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId, sessionId, limit, before } = req.query as {
    agentId: string;
    sessionId?: string;
    limit?: string;
    before?: string;
  };

  const agent = getAgentManager().getAgent(agentId);
  if (!agent) return res.status(404).json({ error: 'Agent not found' });

  const resolvedSessionId = sessionId || await getLatestSessionId(agentId);
  if (!resolvedSessionId) {
    return res.status(200).json({ sessionId: '', messages: [], hasMore: false });
  }

  const parsedLimit = limit ? parseInt(limit, 10) : 50;
  const { messages, hasMore } = await readMessages(agentId, resolvedSessionId, {
    limit: parsedLimit,
    before,
  });

  return res.status(200).json({ sessionId: resolvedSessionId, messages, hasMore });
};

export default handler;
