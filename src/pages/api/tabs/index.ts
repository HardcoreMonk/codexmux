import type { NextApiRequest, NextApiResponse } from 'next';
import { getTabs, addTab } from '@/lib/tab-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const { tabs, activeTabId } = await getTabs();
    return res.status(200).json({ tabs, activeTabId });
  }

  if (req.method === 'POST') {
    try {
      const { name } = req.body ?? {};
      const tab = await addTab(name);
      return res.status(201).json(tab);
    } catch (err) {
      console.log(`[tabs] create failed: ${err instanceof Error ? err.message : err}`);
      return res.status(500).json({ error: 'Failed to create tmux session' });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
