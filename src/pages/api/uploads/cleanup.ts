import type { NextApiRequest, NextApiResponse } from 'next';
import { cleanupAllUploads, cleanupExpiredUploads } from '@/lib/uploads-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('uploads');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mode = (req.body as { mode?: string } | undefined)?.mode === 'all' ? 'all' : 'expired';

  try {
    const result = mode === 'all' ? await cleanupAllUploads() : await cleanupExpiredUploads();
    return res.status(200).json({ mode, ...result });
  } catch (err) {
    log.error(`uploads cleanup failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Cleanup failed' });
  }
};

export default handler;
