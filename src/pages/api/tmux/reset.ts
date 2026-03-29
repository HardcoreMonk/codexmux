import type { NextApiRequest, NextApiResponse } from 'next';
import { listSessions, killServer } from '@/lib/tmux';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessions = await listSessions();
    console.log(`[terminal] tmux reset requested — killing ${sessions.length} session(s)`);
    await killServer();
    return res.status(200).json({ killed: sessions.length });
  } catch (err) {
    console.error(`[terminal] tmux reset failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'tmux 초기화 실패' });
  }
};

export default handler;
