import type { NextApiRequest, NextApiResponse } from 'next';
import { removeTabFromPane, restartTabSession, patchTab } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';
import type { ITab } from '@/types/terminal';

const log = createLogger('layout');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'No workspace found' });
  }

  const paneId = req.query.paneId as string;
  const tabId = req.query.tabId as string;

  if (req.method === 'DELETE') {
    const found = await removeTabFromPane(wsId, paneId, tabId);
    if (!found) {
      return res.status(404).json({ error: 'Tab not found' });
    }
    getStatusManager().removeTab(tabId);
    return res.status(204).end();
  }

  if (req.method === 'POST') {
    try {
      const { command } = req.body ?? {};
      const ok = await restartTabSession(wsId, paneId, tabId, command);
      if (!ok) {
        return res.status(404).json({ error: 'Tab not found' });
      }
      return res.status(200).json({ ok: true });
    } catch (err) {
      log.error(`tab restart failed: ${err instanceof Error ? err.message : err}`);
      return res.status(500).json({ error: 'Failed to restart session' });
    }
  }

  if (req.method === 'PATCH') {
    const { name, panelType, title, cwd, lastCommand, webUrl } = req.body ?? {};

    if (name !== undefined || panelType !== undefined || title !== undefined || cwd !== undefined || lastCommand !== undefined || webUrl !== undefined) {
      const patch: Partial<Pick<ITab, 'name' | 'panelType' | 'title' | 'cwd' | 'lastCommand' | 'webUrl'>> = {};
      if (name !== undefined) {
        if (typeof name !== 'string' || !name.trim()) {
          return res.status(400).json({ error: 'name cannot be empty' });
        }
        patch.name = name.trim();
      }
      if (panelType !== undefined) patch.panelType = panelType;
      if (title !== undefined) patch.title = title;
      if (cwd !== undefined) patch.cwd = cwd;
      if (lastCommand !== undefined) patch.lastCommand = lastCommand;
      if (webUrl !== undefined) patch.webUrl = webUrl;

      const result = await patchTab(wsId, paneId, tabId, patch);
      if (!result) {
        return res.status(404).json({ error: 'Tab not found' });
      }
      return res.status(200).json(result);
    }

    return res.status(400).json({ error: 'No fields to update' });
  }

  res.setHeader('Allow', 'POST, DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
