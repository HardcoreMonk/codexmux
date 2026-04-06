import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { getWorkspaces, createWorkspace } from '@/lib/workspace-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const data = await getWorkspaces();
    return res.status(200).json(data);
  }

  if (req.method === 'POST') {
    const { directory, name } = req.body ?? {};
    const resolvedDirectory =
      directory && typeof directory === 'string' ? directory : os.homedir();

    try {
      const workspace = await createWorkspace(resolvedDirectory, name);
      return res.status(200).json(workspace);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      const isValidation = ['not exist', 'directory', 'registered'].some((k) => message.includes(k));
      return res.status(isValidation ? 400 : 500).json({ error: message });
    }
  }

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
