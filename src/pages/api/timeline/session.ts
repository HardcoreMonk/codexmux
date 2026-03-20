import type { NextApiRequest, NextApiResponse } from 'next';
import { detectSession } from '@/lib/session-detection';
import { getActiveWorkspaceId, getWorkspaceById } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  const workspace = await getWorkspaceById(wsId);
  if (!workspace) {
    return res.status(404).json({ error: 'Workspace를 찾을 수 없습니다' });
  }

  const workspaceDir = workspace.directories[0];
  const sessionInfo = await detectSession(workspaceDir);

  return res.status(200).json(sessionInfo);
};

export default handler;
