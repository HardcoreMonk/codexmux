import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, sendRawKeys } from '@/lib/tmux';
import { createLogger } from '@/lib/logger';

const log = createLogger('tmux');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, input } = req.body as { session?: string; input?: string };

  if (!session || !input) {
    return res.status(400).json({ error: 'session, input 파라미터 필수' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: '세션을 찾을 수 없습니다' });
  }

  try {
    await sendRawKeys(session, input);
    return res.status(200).json({ ok: true });
  } catch (err) {
    log.error(`send-input failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: '입력 전송 실패' });
  }
};

export default handler;
