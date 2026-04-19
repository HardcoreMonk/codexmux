import type { NextApiRequest, NextApiResponse } from 'next';
import { saveImage, isValidMime, MAX_BYTES } from '@/lib/uploads-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('uploads');

export const config = {
  api: {
    bodyParser: false,
    sizeLimit: '12mb',
  },
};

const readBody = (req: NextApiRequest): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BYTES) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const headerString = (value: string | string[] | undefined): string | undefined => {
  if (Array.isArray(value)) return value[0];
  return value;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const mime = headerString(req.headers['content-type'])?.split(';')[0]?.trim() ?? '';
  if (!isValidMime(mime)) {
    return res.status(400).json({ error: 'Unsupported image type' });
  }

  let body: Buffer;
  try {
    body = await readBody(req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed to read body';
    if (message === 'payload too large') {
      return res.status(413).json({ error: 'Image exceeds 10MB' });
    }
    return res.status(400).json({ error: message });
  }

  if (body.length === 0) {
    return res.status(400).json({ error: 'Empty body' });
  }

  const wsId = headerString(req.headers['x-pmux-ws-id']);
  const tabId = headerString(req.headers['x-pmux-tab-id']);
  const originalName = headerString(req.headers['x-pmux-filename']);

  try {
    const saved = await saveImage({
      data: body,
      mime,
      originalName: originalName ? decodeURIComponent(originalName) : undefined,
      wsId,
      tabId,
    });
    return res.status(200).json({ path: saved.path, filename: saved.filename });
  } catch (err) {
    log.error(`upload-image failed: ${err instanceof Error ? err.message : err}`);
    return res.status(500).json({ error: 'Failed to save image' });
  }
};

export default handler;
