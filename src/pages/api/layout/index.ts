import type { NextApiRequest, NextApiResponse } from 'next';
import { getLayout, updateLayout } from '@/lib/layout-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    try {
      const layout = await getLayout();
      return res.status(200).json(layout);
    } catch (err) {
      console.log(`[layout] GET failed: ${err instanceof Error ? err.message : err}`);
      return res.status(500).json({ error: 'Failed to load layout' });
    }
  }

  if (req.method === 'PUT') {
    const { root, focusedPaneId } = req.body ?? {};
    if (!root) {
      return res.status(400).json({ error: 'root 필드 필수' });
    }

    const result = await updateLayout(root, focusedPaneId ?? null);
    if ('error' in result) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
