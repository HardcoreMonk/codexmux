import type { NextApiRequest, NextApiResponse } from 'next';
import { getBuildInfo } from '@/lib/build-info';

const handler = (req: NextApiRequest, res: NextApiResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  res.json(getBuildInfo());
};

export default handler;
