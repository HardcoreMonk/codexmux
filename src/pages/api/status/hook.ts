import type { NextApiRequest, NextApiResponse } from 'next';
import { getStatusManager } from '@/lib/status-manager';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  getStatusManager().poll().catch((err) => {
    console.error('[hook] poll 트리거 실패:', err);
  });

  return res.status(204).end();
};

export default handler;
