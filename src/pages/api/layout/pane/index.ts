import type { NextApiRequest, NextApiResponse } from 'next';
import { createPane } from '@/lib/layout-store';
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

  try {
    const { cwd } = req.body ?? {};
    const result = await createPane(wsId, cwd);
    return res.status(200).json(result);
  } catch (err) {
    console.log(`[layout] pane creation failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to create pane' });
  }
};

export default handler;
