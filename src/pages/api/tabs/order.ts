import type { NextApiRequest, NextApiResponse } from 'next';
import { reorderTabs } from '@/lib/tab-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tabIds } = req.body ?? {};
  if (!Array.isArray(tabIds) || tabIds.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  const tabs = await reorderTabs(tabIds);
  if (!tabs) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  return res.status(200).json({ tabs });
};

export default handler;
