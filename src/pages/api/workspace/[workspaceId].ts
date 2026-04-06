import type { NextApiRequest, NextApiResponse } from 'next';
import { deleteWorkspace, renameWorkspace } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  const workspaceId = req.query.workspaceId as string;

  if (req.method === 'DELETE') {
    const found = await deleteWorkspace(workspaceId);
    if (!found) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    return res.status(204).end();
  }

  if (req.method === 'PATCH') {
    const { name } = req.body ?? {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'name field required' });
    }

    const ws = await renameWorkspace(workspaceId, name.trim());
    if (!ws) {
      return res.status(404).json({ error: 'Workspace not found' });
    }
    return res.status(200).json(ws);
  }

  res.setHeader('Allow', 'DELETE, PATCH');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
