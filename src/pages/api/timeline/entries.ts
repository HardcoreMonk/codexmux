import type { NextApiRequest, NextApiResponse } from 'next';
import { parseJsonlFile } from '@/lib/session-parser';

const DEFAULT_LIMIT = 200;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jsonlPath = req.query.jsonlPath as string;
  if (!jsonlPath) {
    return res.status(400).json({ error: 'jsonlPath 파라미터가 필요합니다' });
  }

  const offset = parseInt(req.query.offset as string, 10) || 0;
  const limit = parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT;

  const allEntries = await parseJsonlFile(jsonlPath);
  const total = allEntries.length;
  const sliced = allEntries.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return res.status(200).json({
    entries: sliced,
    total,
    hasMore,
  });
};

export default handler;
