import type { NextApiRequest, NextApiResponse } from 'next';
import { removeTabFromPane, renameTabInPane, restartTabSession } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  const paneId = req.query.paneId as string;
  const tabId = req.query.tabId as string;

  if (req.method === 'DELETE') {
    const found = await removeTabFromPane(wsId, paneId, tabId);
    if (!found) {
      return res.status(404).json({ error: '탭을 찾을 수 없습니다' });
    }
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    try {
      const ok = await restartTabSession(wsId, paneId, tabId);
      if (!ok) {
        return res.status(404).json({ error: '탭을 찾을 수 없습니다' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      console.log(`[layout] tab restart failed: ${err instanceof Error ? err.message : err}`);
      return res.status(500).json({ error: 'Failed to restart session' });
    }
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name 필드 필수' });
    }

    const tab = await renameTabInPane(wsId, paneId, tabId, name.trim());
    if (!tab) {
      return res.status(404).json({ error: '탭을 찾을 수 없습니다' });
    }
    return res.status(200).json(tab);
  }

  res.setHeader('Allow', 'POST, DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
