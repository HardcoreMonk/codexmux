import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAgentToken } from '@/lib/agent-token';
import { saveMemoryEntry, listMemoryEntries } from '@/lib/agent-chat';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:agent-rpc-memory');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyAgentToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const agentId = req.query.agentId as string;

  if (req.method === 'GET') {
    const query = (req.query.q as string)?.trim() || undefined;
    const tag = (req.query.tag as string)?.trim() || undefined;

    try {
      const entries = await listMemoryEntries(agentId, query, tag);
      return res.status(200).json({ entries });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error(`list memory failed: ${msg}`);
      return res.status(500).json({ error: 'Failed to list memories' });
    }
  }

  if (req.method === 'POST') {
    const { content, tags } = req.body as { content?: string; tags?: string[] };

    if (!content) {
      return res.status(400).json({ error: 'content is required' });
    }

    try {
      const entry = await saveMemoryEntry(agentId, content, tags ?? []);
      return res.status(201).json(entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error(`save memory failed: ${msg}`);
      return res.status(500).json({ error: 'Failed to save memory' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
