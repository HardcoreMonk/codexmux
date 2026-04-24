import type { NextApiRequest, NextApiResponse } from 'next';
import { withBrowserTab } from '@/lib/cli-utils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await withBrowserTab(req, res, 'POST', async ({ tabId, bridge }) => {
    const { expression } = (req.body ?? {}) as { expression?: string };
    if (!expression || typeof expression !== 'string') {
      res.status(400).json({ error: 'expression is required' });
      return;
    }

    try {
      const value = await bridge.evaluate(tabId, expression);
      res.status(200).json({ tabId, value });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'evaluation failed';
      res.status(409).json({ error: msg });
    }
  });
};

export default handler;
