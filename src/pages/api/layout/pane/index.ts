import type { NextApiRequest, NextApiResponse } from 'next';
import { createPane } from '@/lib/layout-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { cwd } = req.body ?? {};
    const result = await createPane(cwd);
    return res.status(200).json(result);
  } catch (err) {
    console.log(`[layout] pane creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create pane' });
  }
};

export default handler;
