import type { NextApiRequest, NextApiResponse } from 'next';
import { setActiveTab } from '@/lib/tab-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { activeTabId } = req.body ?? {};
  if (!activeTabId || typeof activeTabId !== 'string') {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  await setActiveTab(activeTabId);
  return res.status(200).json({ ok: true });
};

export default handler;
