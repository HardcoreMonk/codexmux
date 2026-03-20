import type { NextApiRequest, NextApiResponse } from 'next';
import { removeTab, renameTab } from '@/lib/tab-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const tabId = req.query.id as string;

  if (req.method === 'DELETE') {
    const found = await removeTab(tabId);
    if (!found) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    const tab = await renameTab(tabId, name.trim());
    if (!tab) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    return res.status(200).json(tab);
  }

  res.setHeader('Allow', 'DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
