import type { NextApiRequest, NextApiResponse } from 'next';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';

const execFile = promisify(execFileCb);
const CMD_TIMEOUT = 10000;

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'POST') {
    const { httpsPort, localPort } = req.body ?? {};
    if (!httpsPort || !localPort) {
      return res.status(400).json({ error: 'httpsPort와 localPort가 필요합니다' });
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
    const { httpsPort } = req.body ?? {};
    if (!httpsPort) {
      return res.status(400).json({ error: 'httpsPort가 필요합니다' });
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
