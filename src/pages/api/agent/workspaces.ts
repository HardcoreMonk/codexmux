import type { NextApiRequest, NextApiResponse } from 'next';
import { getWorkspaces } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { workspaces } = await getWorkspaces();

  const result = workspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    directories: ws.directories,
  }));

  return res.status(200).json({ workspaces: result });
};

export default handler;
