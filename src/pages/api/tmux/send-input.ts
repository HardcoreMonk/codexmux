import type { NextApiRequest, NextApiResponse } from 'next';
import { hasSession, sendRawKeys } from '@/lib/tmux';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('tmux');

const POST_INPUT_POLL_DELAY_MS = 300;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { session, input } = req.body as { session?: string; input?: string };

  if (!session || !input) {
    return res.status(400).json({ error: 'session and input parameters required' });
  }

  const exists = await hasSession(session);
  if (!exists) {
    return res.status(404).json({ error: 'Session not found' });
  }

  try {
    await sendRawKeys(session, input);
    const manager = getStatusManager();
    manager.clearHookGraceBySession(session);
    setTimeout(() => {
      manager.poll().catch((err) => {
        log.error(`post-input poll failed: ${err instanceof Error ? err.message : err}`);
      });
    }, POST_INPUT_POLL_DELAY_MS);
    return res.status(200).json({ ok: true });
  } catch (err) {
    log.error(`send-input failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to send input' });
  }
};

export default handler;
