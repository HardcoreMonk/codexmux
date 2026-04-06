import type { NextApiRequest, NextApiResponse } from 'next';
import { readSidebarItems, writeSidebarItems } from '@/lib/sidebar-items-store';
import type { ISidebarItemsFile } from '@/lib/sidebar-items-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const data = await readSidebarItems();
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const body = req.body as ISidebarItemsFile;
    if (!Array.isArray(body.custom) || !Array.isArray(body.disabledBuiltinIds) || !Array.isArray(body.order)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    await writeSidebarItems(body);
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
