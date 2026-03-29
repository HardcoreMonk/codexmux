import type { NextApiRequest, NextApiResponse } from 'next';
import { listSessions, killServer, scanSessions, applyConfig } from '@/lib/tmux';
import { initWorkspaceStore } from '@/lib/workspace-store';
import { autoResumeOnStartup } from '@/lib/auto-resume';
import { getStatusManager } from '@/lib/status-manager';
import { detachAll } from '@/lib/terminal-server';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const sessions = await listSessions();
    console.log(`[terminal] tmux reset requested — killing ${sessions.length} session(s)`);
    detachAll();
    await killServer();

    await scanSessions();
    await applyConfig();
    await initWorkspaceStore();
    await autoResumeOnStartup();
    await getStatusManager().rescan();

    console.log('[terminal] tmux re-initialized after reset');
    return res.status(200).json({ killed: sessions.length });
  } catch (err) {
    console.error(`[terminal] tmux reset failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'tmux 초기화 실패' });
  }
};

export default handler;
