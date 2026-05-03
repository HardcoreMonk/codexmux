import type { NextApiRequest, NextApiResponse } from 'next';
import { verifyCliToken } from '@/lib/cli-token';
import { pollRemoteTerminalCommands } from '@/lib/remote-terminal-store';

const readQueryString = (value: string | string[] | undefined): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const readQueryNumber = (value: string | string[] | undefined): number | null => {
  if (typeof value !== 'string') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!verifyCliToken(req)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const sourceId = readQueryString(req.query.sourceId);
  if (!sourceId) {
    return res.status(400).json({ error: 'missing-source-id' });
  }

  const result = pollRemoteTerminalCommands({
    sourceId,
    terminalId: readQueryString(req.query.terminalId),
    afterSeq: readQueryNumber(req.query.afterSeq),
    max: readQueryNumber(req.query.max),
  });
  return res.status(200).json(result);
};

export default handler;
