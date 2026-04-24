import type { NextApiRequest, NextApiResponse } from 'next';
import { withBrowserTab } from '@/lib/cli-utils';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  await withBrowserTab(req, res, 'GET', ({ tabId, bridge }) => {
    const since = typeof req.query.since === 'string' ? parseInt(req.query.since, 10) : 0;
    const level = typeof req.query.level === 'string' ? req.query.level : undefined;

    let entries = bridge.getConsole(tabId, Number.isFinite(since) ? since : 0);
    if (level) entries = entries.filter((e) => e.level === level);

    res.status(200).json({ tabId, entries });
  });
};

export default handler;
