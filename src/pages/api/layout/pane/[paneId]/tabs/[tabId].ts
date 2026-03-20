import type { NextApiRequest, NextApiResponse } from 'next';
import { removeTabFromPane, renameTabInPane } from '@/lib/layout-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const paneId = req.query.paneId as string;
  const tabId = req.query.tabId as string;

  if (req.method === 'DELETE') {
    const found = await removeTabFromPane(paneId, tabId);
    if (!found) {
      return res.status(404).json({ error: '탭을 찾을 수 없습니다' });
    }
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name 필드 필수' });
    }

    const tab = await renameTabInPane(paneId, tabId, name.trim());
    if (!tab) {
      return res.status(404).json({ error: '탭을 찾을 수 없습니다' });
    }
    return res.status(200).json(tab);
  }

  res.setHeader('Allow', 'DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
