import type { NextApiRequest, NextApiResponse } from 'next';
import { createPane, splitPaneInLayout } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('layout');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  try {
    const { sourcePaneId, orientation, cwd, panelType } = req.body ?? {};

    if (sourcePaneId && orientation) {
      const result = await splitPaneInLayout(wsId, sourcePaneId, orientation, cwd, panelType);
      if (!result) {
        return res.status(404).json({ error: '대상 Pane을 찾을 수 없습니다' });
      }
      return res.status(200).json(result);
    }

    const result = await createPane(wsId, cwd);
    return res.status(200).json(result);
  } catch (err) {
    log.error(`pane creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create pane' });
  }
};

export default handler;
