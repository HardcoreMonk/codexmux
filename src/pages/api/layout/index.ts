import type { NextApiRequest, NextApiResponse } from 'next';
import { getLayout, updateLayout } from '@/lib/layout-store';
import { getActiveWorkspaceId, getWorkspaceById } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const wsId = (req.query.workspace as string) || getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  if (req.method === 'GET') {
    try {
      const ws = getWorkspaceById(wsId);
      const layout = await getLayout(wsId, ws?.directory);
      return res.status(200).json(layout);
    } catch (err) {
      console.log(`[layout] GET failed: ${err instanceof Error ? err.message : err}`);
      return res.status(500).json({ error: 'Failed to load layout' });
    }
  }

  if (req.method === 'PUT') {
    const { root, focusedPaneId } = req.body ?? {};
    if (!root) {
      return res.status(400).json({ error: 'root 필드 필수' });
    }

    const result = await updateLayout(wsId, root, focusedPaneId ?? null);
    if ('error' in result) {
      return res.status(400).json(result);
    }
    return res.status(200).json(result);
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
