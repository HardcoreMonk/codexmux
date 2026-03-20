import type { NextApiRequest, NextApiResponse } from 'next';
import { updateActive } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { activeWorkspaceId, sidebarCollapsed, sidebarWidth } = req.body ?? {};
  await updateActive({ activeWorkspaceId, sidebarCollapsed, sidebarWidth });
  return res.status(200).json({ ok: true });
};

export default handler;
