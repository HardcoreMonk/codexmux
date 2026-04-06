import type { NextApiRequest, NextApiResponse } from 'next';
import { readEntriesBefore } from '@/lib/session-parser';
import { isAllowedJsonlPath } from '@/lib/path-validation';

const DEFAULT_LIMIT = 64;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jsonlPath = req.query.jsonlPath as string;
  if (!jsonlPath) {
    return res.status(400).json({ error: 'jsonlPath parameter required' });
  }

  if (!isAllowedJsonlPath(jsonlPath)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  const beforeByte = parseInt(req.query.beforeByte as string, 10);
  if (isNaN(beforeByte) || beforeByte < 0) {
    return res.status(400).json({ error: 'beforeByte parameter required' });
  }

  const limit = parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT;

  const result = await readEntriesBefore(jsonlPath, beforeByte, limit);

  return res.status(200).json({
    entries: result.entries,
    startByteOffset: result.startByteOffset,
    hasMore: result.hasMore,
  });
};

export default handler;
