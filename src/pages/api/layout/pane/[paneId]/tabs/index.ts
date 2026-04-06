import type { NextApiRequest, NextApiResponse } from 'next';
import { addTabToPane } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import { getStatusManager } from '@/lib/status-manager';
import { createLogger } from '@/lib/logger';

const log = createLogger('layout');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'No workspace found' });
  }

  const paneId = req.query.paneId as string;
  const { name, cwd, panelType, command, resumeSessionId } = req.body ?? {};

  try {
    const tab = await addTabToPane(wsId, paneId, name, cwd, panelType, command, resumeSessionId);
    if (!tab) {
      return res.status(404).json({ error: 'Pane not found' });
    }
    if (tab.panelType !== 'web-browser') {
      getStatusManager().registerTab(tab.id, {
        cliState: 'inactive',
        workspaceId: wsId,
        tabName: tab.name,
        tmuxSession: tab.sessionName,
      });
    }
    return res.status(200).json(tab);
  } catch (err) {
    log.error(`tab creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create tab' });
  }
};

export default handler;
