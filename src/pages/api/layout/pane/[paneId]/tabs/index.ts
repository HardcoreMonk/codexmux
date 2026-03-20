import type { NextApiRequest, NextApiResponse } from 'next';
import { addTabToPane } from '@/lib/layout-store';
import { getActiveWorkspaceId } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  const paneId = req.query.paneId as string;
  const { name } = req.body ?? {};

  try {
    const tab = await addTabToPane(wsId, paneId, name);
    if (!tab) {
      return res.status(404).json({ error: 'Pane을 찾을 수 없습니다' });
    }
    return res.status(200).json(tab);
  } catch (err) {
    console.log(`[layout] tab creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create tab' });
  }
};

export default handler;
