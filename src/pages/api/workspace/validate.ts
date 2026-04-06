import type { NextApiRequest, NextApiResponse } from 'next';
import { validateDirectory } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const directory = req.query.directory as string;
  if (!directory) {
    return res.status(400).json({ error: 'directory parameter required' });
  }

  const result = await validateDirectory(directory);
  return res.status(200).json(result);
};

export default handler;
