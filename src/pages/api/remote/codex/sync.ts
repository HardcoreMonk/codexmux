import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { writeRemoteCodexChunk } from '@/lib/remote-codex-store';

const MAX_CONTENT_BYTES = 2 * 1024 * 1024;

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '4mb',
    },
  },
};

const readString = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const readNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const body = req.body as Record<string, unknown>;
  const contentBase64 = readString(body.contentBase64);
  const offset = readNumber(body.offset);

  if (!contentBase64 || offset === null || offset < 0) {
    return res.status(400).json({ error: 'invalid-payload' });
  }

  let content: Buffer;
  try {
    content = Buffer.from(contentBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'invalid-content' });
  }

  if (content.length === 0 || content.length > MAX_CONTENT_BYTES) {
    return res.status(413).json({ error: 'content-too-large' });
  }

  try {
    const result = await writeRemoteCodexChunk({
      sourceId: readString(body.sourceId),
      host: readString(body.host),
      shell: readString(body.shell),
      cwd: readString(body.cwd),
      windowsPath: readString(body.windowsPath),
      sessionId: readString(body.sessionId),
      startedAt: readString(body.startedAt),
      mtimeMs: readNumber(body.mtimeMs),
      offset,
      reset: body.reset === true,
      content,
    });

    return res.status(200).json({
      ok: true,
      sessionId: result.sessionId,
      jsonlPath: result.jsonlPath,
      offset: result.offset,
      sourceId: result.sourceId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'internal-error';
    if (message === 'missing-session-id') {
      return res.status(400).json({ error: message });
    }
    if (message === 'offset-mismatch') {
      const expectedOffset = (err as Error & { expectedOffset?: number }).expectedOffset ?? 0;
      return res.status(409).json({ error: message, expectedOffset });
    }
    return res.status(500).json({ error: 'internal-error', message });
  }
};

export default handler;
