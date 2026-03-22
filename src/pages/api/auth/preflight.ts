import type { NextApiRequest, NextApiResponse } from 'next';
import { getPreflightStatus } from '@/lib/preflight';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const status = await getPreflightStatus();
  return res.status(200).json(status);
};

export default handler;
