import type { NextApiRequest, NextApiResponse } from 'next';
import {
  cleanupAllUploads,
  cleanupExpiredUploads,
  cleanupStaleUploadParts,
} from '@/lib/uploads-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('uploads');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mode = (req.body as { mode?: string } | undefined)?.mode === 'all' ? 'all' : 'expired';

  try {
    const committed = mode === 'all' ? await cleanupAllUploads() : await cleanupExpiredUploads();
    const staged = await cleanupStaleUploadParts();
    return res.status(200).json({
      mode,
      deleted: committed.deleted + staged.deleted,
      freedBytes: committed.freedBytes + staged.freedBytes,
    });
  } catch {
    log.error('uploads cleanup failed');
    return res.status(500).json({ error: 'Cleanup failed' });
  }
};

export default handler;
