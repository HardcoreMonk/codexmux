import type { NextApiRequest, NextApiResponse } from 'next';
import { parseSessionFile } from '@/lib/session-parser';
import { isAllowedJsonlPath } from '@/lib/path-validation';

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

  if (!isAllowedJsonlPath(jsonlPath)) {
    return res.status(403).json({ error: '허용되지 않는 경로입니다' });
  }

  const offset = parseInt(req.query.offset as string, 10) || 0;
  const limit = parseInt(req.query.limit as string, 10) || DEFAULT_LIMIT;

  const result = await parseSessionFile(jsonlPath);
  const total = result.entries.length;
  const sliced = result.entries.slice(offset, offset + limit);
  const hasMore = offset + limit < total;

  return res.status(200).json({
    entries: sliced,
    total,
    hasMore,
  });
};

export default handler;
