import type { NextApiRequest, NextApiResponse } from 'next';
import { deletePane } from '@/lib/layout-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const paneId = req.query.paneId as string;
  const { found } = await deletePane(paneId);
  if (!found) {
    return res.status(404).json({ error: 'Pane을 찾을 수 없습니다' });
  }

  return res.status(204).end();
};

export default handler;
