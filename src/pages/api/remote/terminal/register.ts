import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { ensureRemoteTerminal } from '@/lib/remote-terminal-store';

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
  if (!sourceId) {
    return res.status(400).json({ error: 'missing-source-id' });
  }

  const terminal = ensureRemoteTerminal({
    sourceId,
    terminalId: readString(body.terminalId),
    host: readString(body.host),
    shell: readString(body.shell),
    cwd: readString(body.cwd),
    cols: readNumber(body.cols),
    rows: readNumber(body.rows),
  });

  return res.status(200).json({ ok: true, terminal });
};

export default handler;
