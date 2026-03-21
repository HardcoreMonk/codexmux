import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CACHE_PATH = path.join(os.homedir(), '.purple-terminal', 'stats', 'cache.json');

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  try {
    await fs.access(CACHE_PATH);
    return res.status(200).json({ exists: true });
  } catch {
    return res.status(200).json({ exists: false });
  }
};

export default handler;
