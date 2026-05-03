import type { NextApiRequest, NextApiResponse } from 'next';
import { listRemoteTerminals } from '@/lib/remote-terminal-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  return res.status(200).json({ terminals: listRemoteTerminals() });
};

export default handler;
