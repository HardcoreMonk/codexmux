import type { NextApiRequest, NextApiResponse } from 'next';
import { getSessionCwd, getLastCommand, hasSession } from '@/lib/tmux';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = req.query.session as string | undefined;
  if (!session) {
    return res.status(400).json({ error: 'session 파라미터 필수' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
  }

  try {
    const [cwd, lastCommand] = await Promise.all([
      getSessionCwd(session),
      getLastCommand(session),
    ]);
    if (!cwd) {
      return res.status(500).json({ error: 'CWD 조회 실패' });
    }
    return res.status(200).json({ cwd, lastCommand });
  } catch (err) {
    console.log(`[layout] cwd query failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'CWD 조회 실패' });
  }
};

export default handler;
