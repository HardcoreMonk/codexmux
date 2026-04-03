import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, getPaneDetailInfo, getLastCommand } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';

const log = createLogger('tmux');

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
    const [info, lastCommand] = await Promise.all([
      getPaneDetailInfo(session),
      getLastCommand(session),
    ]);
    return res.status(200).json({
      ...info,
      lastCommand,
      sessionName: session,
    });
  } catch (err) {
    log.error(`info query failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'tmux 정보 조회 실패' });
  }
};

export default handler;
