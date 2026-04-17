import type { NextApiRequest, NextApiResponse } from 'next';
import { getCachedPreflightStatus } from '@/lib/preflight';
import { needsSetup } from '@/lib/config-store';
import { verifyRequestSession } from '@/lib/auth';
import { verifyCliToken } from '@/lib/cli-token';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!(await needsSetup())) {
    const authed = verifyCliToken(req) || (await verifyRequestSession(req.headers.cookie));
    if (!authed) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  const status = await getCachedPreflightStatus();
  return res.status(200).json(status);
};

export default handler;
