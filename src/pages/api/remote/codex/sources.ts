import type { NextApiRequest, NextApiResponse } from 'next';
import { listRemoteCodexSources } from '@/lib/remote-codex-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sources = await listRemoteCodexSources();
  return res.status(200).json({ sources });
};

export default handler;
