import type { NextApiRequest, NextApiResponse } from 'next';
import { withBrowserTab } from '@/lib/cli-utils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await withBrowserTab(req, res, 'GET', async ({ tabId, bridge }) => {
    const fullPage = req.query.full === '1' || req.query.full === 'true';
    const format = req.query.format === 'base64' ? 'base64' : 'png';

    try {
      const base64 = await bridge.capture(tabId, { fullPage });
      if (format === 'base64') {
        res.status(200).json({ tabId, format: 'png', base64 });
        return;
      }
      const buf = Buffer.from(base64, 'base64');
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', String(buf.byteLength));
      res.status(200).end(buf);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'capture failed';
      res.status(409).json({ error: msg });
    }
  });
};

export default handler;
