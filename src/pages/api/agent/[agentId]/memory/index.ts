import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { createLogger } from '@/lib/logger';
import type { IMemoryNode, IMemoryTreeResponse } from '@/types/memory';

const log = createLogger('api:agent-memory');
const AGENTS_DIR = path.join(os.homedir(), '.purplemux', 'agents');

const buildTree = async (dirPath: string, basePath: string): Promise<IMemoryNode[]> => {
  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const nodes: IMemoryNode[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(AGENTS_DIR, fullPath);

    if (entry.isDirectory()) {
      const children = await buildTree(fullPath, basePath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'directory',
        children,
      });
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = await fs.stat(fullPath);
      nodes.push({
        name: entry.name,
        path: relativePath,
        type: 'file',
        sizeBytes: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      });
    }
  }

  return nodes;
};

const countStats = (nodes: IMemoryNode[]): { files: number; bytes: number } => {
  let files = 0;
  let bytes = 0;
  for (const node of nodes) {
    if (node.type === 'file') {
      files++;
      bytes += node.sizeBytes ?? 0;
    } else if (node.children) {
      const sub = countStats(node.children);
      files += sub.files;
      bytes += sub.bytes;
    }
  }
  return { files, bytes };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { agentId } = req.query as { agentId: string };

  try {
    await fs.mkdir(AGENTS_DIR, { recursive: true });

    const tree = await buildTree(AGENTS_DIR, AGENTS_DIR);
    const totalStats = countStats(tree);

    const agentNode = tree.find((n) => n.type === 'directory' && n.name === agentId);
    const agentStats = agentNode?.children ? countStats(agentNode.children) : { files: 0, bytes: 0 };

    const response: IMemoryTreeResponse = {
      tree,
      stats: {
        totalFiles: totalStats.files,
        totalSizeBytes: totalStats.bytes,
        agentFiles: agentStats.files,
        agentSizeBytes: agentStats.bytes,
      },
    };

    return res.status(200).json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    log.error(`fetch memory tree failed: ${message}`);
    return res.status(500).json({ error: 'Failed to fetch memory tree' });
  }
};

export default handler;
