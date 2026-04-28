import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { getLayout, addTabToPane } from '@/lib/layout-store';
import { collectPanes } from '@/lib/layout-tree';
import { getWorkspaceById, getWorkspaces } from '@/lib/workspace-store';
import { resolveFirstPaneId } from '@/lib/cli-utils';
import { createLogger } from '@/lib/logger';
import { normalizePanelType } from '@/lib/panel-type';
import type { TPanelType } from '@/types/terminal';

const log = createLogger('api:cli:tabs');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (req.method === 'GET') {
    const wsId = typeof req.query.workspaceId === 'string' ? req.query.workspaceId : undefined;
    const tabs: Array<{ tabId: string; workspaceId: string; name: string; sessionName: string; panelType?: string }> = [];

    const workspaceIds = wsId ? [wsId] : (await getWorkspaces()).workspaces.map((w) => w.id);

    for (const id of workspaceIds) {
      const ws = await getWorkspaceById(id);
      if (!ws) continue;
      const layout = await getLayout(id);
      for (const pane of collectPanes(layout.root)) {
        for (const tab of pane.tabs) {
          tabs.push({
            tabId: tab.id,
            workspaceId: id,
            name: tab.name,
            sessionName: tab.sessionName,
            panelType: tab.panelType,
          });
        }
      }
    }
    return res.status(200).json({ tabs });
  }

  if (req.method === 'POST') {
    const { workspaceId, name, panelType } = req.body as {
      workspaceId?: string;
      name?: string;
      panelType?: string;
    };
    if (!workspaceId) {
      return res.status(400).json({ error: 'workspaceId is required' });
    }
    const ws = await getWorkspaceById(workspaceId);
    if (!ws) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    const paneId = await resolveFirstPaneId(workspaceId);
    if (!paneId) {
      return res.status(500).json({ error: 'No pane available in workspace' });
    }
    const resolvedType: TPanelType = normalizePanelType(panelType) ?? 'terminal';

    try {
      const tab = await addTabToPane(workspaceId, paneId, name, ws.directories[0], resolvedType);
      if (!tab) return res.status(500).json({ error: 'Failed to create tab' });
      return res.status(201).json({
        tabId: tab.id,
        workspaceId,
        paneId,
        sessionName: tab.sessionName,
        name: tab.name,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      log.error(`create tab failed: ${msg}`);
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
