import type { NextApiRequest, NextApiResponse } from 'next';
import { withBrowserTab } from '@/lib/cli-utils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await withBrowserTab(req, res, 'GET', ({ tabId, bridge }) => {
    const url = bridge.getUrl(tabId);
    const title = bridge.getTitle(tabId);
    if (url === null) {
      res.status(409).json({ error: 'Browser tab not attached yet' });
      return;
    }
    res.status(200).json({ tabId, url, title });
  });
};

export default handler;
