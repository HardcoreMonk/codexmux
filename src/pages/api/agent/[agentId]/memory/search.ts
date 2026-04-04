import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import type { IMemorySearchResponse, IMemorySearchResult } from '@/types/memory';

const log = createLogger('api:agent-memory-search');
const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');

const searchFiles = async (
  dirPath: string,
  query: string,
  results: IMemorySearchResult[],
): Promise<void> => {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      await searchFiles(fullPath, query, results);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        const lowerQuery = query.toLowerCase();
        const matches: Array<{ line: number; content: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(lowerQuery)) {
            matches.push({ line: i + 1, content: lines[i].trim() });
          }
        }

        if (matches.length > 0) {
          results.push({
            path: path.relative(AGENTS_DIR, fullPath),
            fileName: entry.name,
            matches: matches.slice(0, 5),
          });
        }
      } catch {
        // skip unreadable files
      }
    }
  }
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const q = (req.query.q as string)?.trim();
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const results: IMemorySearchResult[] = [];
    await searchFiles(AGENTS_DIR, q, results);

    const response: IMemorySearchResponse = { results };
    return res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error(`memory search failed: ${message}`);
    return res.status(500).json({ error: 'Search failed' });
  }
};

export default handler;
