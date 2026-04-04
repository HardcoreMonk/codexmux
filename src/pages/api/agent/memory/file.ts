import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import type { IMemoryFileResponse, ISaveMemoryFileRequest, ISaveMemoryFileResponse } from '@/types/memory';

const log = createLogger('api:agent-memory-file');
const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');

const isPathSafe = (filePath: string): boolean => {
  const resolved = path.resolve(AGENTS_DIR, filePath);
  return resolved.startsWith(AGENTS_DIR + path.sep) || resolved === AGENTS_DIR;
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method === 'GET') {
    const filePath = req.query.path as string;
    if (!filePath) {
      return res.status(400).json({ error: 'path is required' });
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.resolve(AGENTS_DIR, filePath);

    try {
      const [content, stat] = await Promise.all([
        fs.readFile(fullPath, 'utf-8'),
        fs.stat(fullPath),
      ]);

      const response: IMemoryFileResponse = {
        path: filePath,
        content,
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      };

      return res.status(200).json(response);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return res.status(404).json({ error: 'File not found' });
      }
      const message = err instanceof Error ? err.message : 'unknown error';
      log.error(`read memory file failed: ${message}`);
      return res.status(500).json({ error: 'Failed to read file' });
    }
  }

  if (req.method === 'PUT') {
    const { path: filePath, content } = req.body as ISaveMemoryFileRequest;
    if (!filePath || content === undefined) {
      return res.status(400).json({ error: 'path and content are required' });
    }

    if (!isPathSafe(filePath)) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const fullPath = path.resolve(AGENTS_DIR, filePath);

    try {
      await fs.writeFile(fullPath, content, 'utf-8');
      const stat = await fs.stat(fullPath);

      const response: ISaveMemoryFileResponse = {
        saved: true,
        modifiedAt: stat.mtime.toISOString(),
      };

      return res.status(200).json(response);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      log.error(`save memory file failed: ${message}`);
      return res.status(500).json({ error: 'Failed to save file' });
    }
  }

  res.setHeader('Allow', 'GET, PUT');
  return res.status(405).json({ error: 'Method not allowed' });
};

export default handler;
