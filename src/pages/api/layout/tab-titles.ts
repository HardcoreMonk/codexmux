import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionsInfo } from '@/lib/tmux';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).end();
  }

  const { sessions } = req.body as { sessions: string[] };
  if (!Array.isArray(sessions)) {
    return res.status(400).json({ error: 'sessions required' });
  }

  const info = await getSessionsInfo();
  const titles: Record<string, { command: string; cwd: string }> = {};

  for (const session of sessions) {
    const s = info.get(session);
    if (s) {
      titles[session] = s;
    }
  }

  return res.json({ titles, homePath: process.env.HOME || '' });
};

export default handler;
