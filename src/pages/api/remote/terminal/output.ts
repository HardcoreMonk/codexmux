import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { appendRemoteTerminalOutput, ensureRemoteTerminal } from '@/lib/remote-terminal-store';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '2mb',
    },
  },
};

const MAX_OUTPUT_BYTES = 1024 * 1024;

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
  const sourceId = readString(body.sourceId);
  const dataBase64 = readString(body.dataBase64);
  if (!sourceId || !dataBase64) {
    return res.status(400).json({ error: 'invalid-payload' });
  }

  let data: Buffer;
  try {
    data = Buffer.from(dataBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'invalid-output' });
  }
  if (data.length === 0 || data.length > MAX_OUTPUT_BYTES) {
    return res.status(413).json({ error: 'output-too-large' });
  }

  ensureRemoteTerminal({
    sourceId,
    terminalId: readString(body.terminalId),
    host: readString(body.host),
    shell: readString(body.shell),
    cwd: readString(body.cwd),
    cols: readNumber(body.cols),
    rows: readNumber(body.rows),
  });
  const output = appendRemoteTerminalOutput({
    sourceId,
    terminalId: readString(body.terminalId),
    data,
  });

  return res.status(200).json({ ok: true, seq: output.seq });
};

export default handler;
