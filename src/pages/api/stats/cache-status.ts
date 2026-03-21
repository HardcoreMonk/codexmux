import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CACHE_PATH = path.join(os.homedir(), '.purple-terminal', 'stats', 'cache.json');
const PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');

const countJsonlFiles = async (): Promise<number> => {
  let count = 0;
  try {
    const dirs = await fs.readdir(PROJECTS_DIR);
    for (const dir of dirs) {
      const dirPath = path.join(PROJECTS_DIR, dir);
      const stat = await fs.stat(dirPath).catch(() => null);
      if (!stat?.isDirectory()) continue;
      const files = await fs.readdir(dirPath).catch(() => []);
      count += files.filter((f) => f.endsWith('.jsonl') && !/^agent-/.test(f)).length;
    }
  } catch {
    // ignore
  }
  return count;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }

  const fileCount = await countJsonlFiles();

  try {
    await fs.access(CACHE_PATH);
    return res.status(200).json({ exists: true, fileCount });
  } catch {
    return res.status(200).json({ exists: false, fileCount });
  }
};

export default handler;
