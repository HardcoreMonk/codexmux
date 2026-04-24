import type { NextApiRequest, NextApiResponse } from 'next';
import { withBrowserTab } from '@/lib/cli-utils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await withBrowserTab(req, res, 'GET', async ({ tabId, bridge }) => {
    const requestId = typeof req.query.requestId === 'string' ? req.query.requestId : undefined;
    if (requestId) {
      const body = await bridge.getResponseBody(tabId, requestId);
      if (body === null) {
        res.status(404).json({ error: 'Response body unavailable' });
        return;
      }
      res.status(200).json({ tabId, requestId, body });
      return;
    }

    const since = typeof req.query.since === 'string' ? parseInt(req.query.since, 10) : 0;
    const method = typeof req.query.method === 'string' ? req.query.method.toUpperCase() : undefined;
    const urlFilter = typeof req.query.url === 'string' ? req.query.url : undefined;
    const status = typeof req.query.status === 'string' ? parseInt(req.query.status, 10) : undefined;

    let entries = bridge.getNetwork(tabId, Number.isFinite(since) ? since : 0);
    if (method) entries = entries.filter((e) => e.method === method);
    if (urlFilter) entries = entries.filter((e) => e.url.includes(urlFilter));
    if (Number.isFinite(status)) entries = entries.filter((e) => e.status === status);

    res.status(200).json({ tabId, entries });
  });
};

export default handler;
