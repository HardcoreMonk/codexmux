import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 10000;

const parsePort = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 && n <= 65535 ? n : null;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const httpsPort = parsePort(req.body?.httpsPort);
    const localPort = parsePort(req.body?.localPort);
    if (!httpsPort || !localPort) {
      return res.status(400).json({ error: 'Valid port number required (1-65535)' });
    }

    try {
      await execFile(
        'tailscale',
        ['serve', '--bg', `--https=${httpsPort}`, `http://localhost:${localPort}`],
        { timeout: CMD_TIMEOUT },
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  }

  if (req.method === 'DELETE') {
    const httpsPort = parsePort(req.body?.httpsPort);
    if (!httpsPort) {
      return res.status(400).json({ error: 'Valid port number required (1-65535)' });
    }

    try {
      await execFile(
        'tailscale',
        ['serve', 'off', `--https=${httpsPort}`],
        { timeout: CMD_TIMEOUT },
      );
      return res.status(200).json({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: msg });
    }
  }

  res.setHeader('Allow', 'POST, DELETE');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
