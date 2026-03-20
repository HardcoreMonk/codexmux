import type { NextApiRequest, NextApiResponse } from 'next';
import { deletePane } from '@/lib/layout-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const paneId = req.query.paneId as string;
  const sessions: string[] = req.body?.sessions ?? [];
  await deletePane(paneId, sessions);

  return res.status(204).end();
};

export default handler;
