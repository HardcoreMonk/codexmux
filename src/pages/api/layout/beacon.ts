import type { NextApiRequest, NextApiResponse } from 'next';
import { updateLayout, collectAllTabs } from '@/lib/layout-store';
import { getActiveWorkspaceId, updateWorkspaceDirectories } from '@/lib/workspace-store';

export const config = {
  api: { bodyParser: true },
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const wsId = (req.query.workspace as string) || await getActiveWorkspaceId();
  if (!wsId) {
    return res.status(400).json({ error: 'Workspace가 없습니다' });
  }

  const { root, focusedPaneId } = req.body ?? {};
  if (!root) {
    return res.status(400).json({ error: 'root 필드 필수' });
  }

  const result = await updateLayout(wsId, root, focusedPaneId ?? null);
  if (!('error' in result)) {
    const cwds = [...new Set(
      collectAllTabs(result.root)
        .map((t) => t.cwd)
        .filter((c): c is string => !!c),
    )];
    if (cwds.length > 0) {
      updateWorkspaceDirectories(wsId, cwds).catch(() => {});
    }
  }
  return res.status(200).json({ ok: true });
};

export default handler;
