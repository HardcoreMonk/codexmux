import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyAgentToken } from '@/lib/agent-token';
import { getMemoryEntry, deleteMemoryEntry } from '@/lib/agent-chat';
import { createLogger } from '@/lib/logger';

const log = createLogger('api:agent-rpc-memory-entry');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyAgentToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const agentId = req.query.agentId as string;
  const memoryId = req.query.memoryId as string;

  if (req.method === 'GET') {
    try {
      const entry = await getMemoryEntry(agentId, memoryId);
      if (!entry) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      return res.status(200).json(entry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error(`get memory failed: ${msg}`);
      return res.status(500).json({ error: 'Failed to get memory' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const deleted = await deleteMemoryEntry(agentId, memoryId);
      if (!deleted) {
        return res.status(404).json({ error: 'Memory not found' });
      }
      return res.status(200).json({ deleted: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error(`delete memory failed: ${msg}`);
      return res.status(500).json({ error: 'Failed to delete memory' });
    }
  }

  res.setHeader('Allow', 'GET, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
