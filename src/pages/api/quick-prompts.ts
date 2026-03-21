import type { NextApiRequest, NextApiResponse } from 'next';
import { readQuickPrompts, writeQuickPrompts } from '@/lib/quick-prompts-store';
import type { IQuickPromptsFile } from '@/lib/quick-prompts-store';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const data = await readQuickPrompts();
    return res.status(200).json(data);
  }

  if (req.method === 'PUT') {
    const body = req.body as IQuickPromptsFile;
    if (!Array.isArray(body.custom) || !Array.isArray(body.disabledBuiltinIds)) {
      return res.status(400).json({ error: 'Invalid format' });
    }
    await writeQuickPrompts(body);
    return res.status(200).json({ success: true });
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
