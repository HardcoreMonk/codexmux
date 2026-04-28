import type { NextApiRequest, NextApiResponse } from 'next';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { createInterface } from 'readline';
import { isAllowedJsonlPath } from '@/lib/path-validation';

interface IRawEntry {
  type?: string;
  uuid?: string;
  requestId?: string;
  isMeta?: boolean;
  isSidechain?: boolean;
  message?: {
    content?: unknown;
  };
}

interface ICountResult {
  userCount: number;
  assistantCount: number;
  toolCount: number;
  toolBreakdown: Record<string, number>;
}

interface ICacheEntry {
  counts: ICountResult;
  mtime: number;
  size: number;
}

const CACHE_LIMIT = 100;

const g = globalThis as unknown as { __cmuxMessageCountsCache?: Map<string, ICacheEntry> };
if (!g.__cmuxMessageCountsCache) g.__cmuxMessageCountsCache = new Map();
const cache = g.__cmuxMessageCountsCache;

const cacheGet = (key: string, mtime: number, size: number): ICountResult | null => {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.mtime !== mtime || entry.size !== size) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.counts;
};

const cacheSet = (key: string, counts: ICountResult, mtime: number, size: number) => {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, { counts, mtime, size });
  while (cache.size > CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
};

const isRealUserMessage = (entry: IRawEntry): boolean => {
  const content = entry.message?.content;
  if (typeof content === 'string') return content.length > 0;
  if (Array.isArray(content)) {
    return content.some((c) => {
      if (typeof c !== 'object' || c === null) return false;
      return (c as { type?: string }).type !== 'tool_result';
    });
  }
  return false;
};

const countMessages = async (filePath: string): Promise<ICountResult> => {
  let userCount = 0;
  let toolCount = 0;
  const assistantIds = new Set<string>();
  const toolBreakdown: Record<string, number> = {};

  const stream = createReadStream(filePath, { encoding: 'utf-8' });
  const rl = createInterface({ input: stream, crlfDelay: Infinity });

  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      let obj: IRawEntry;
      try {
        obj = JSON.parse(line) as IRawEntry;
      } catch {
        continue;
      }
      if (obj.isMeta === true) continue;
      if (obj.isSidechain === true) continue;

      if (obj.type === 'assistant') {
        const id = obj.requestId ?? obj.uuid;
        if (id) assistantIds.add(id);

        const content = obj.message?.content;
        if (Array.isArray(content)) {
          for (const item of content) {
            if (typeof item !== 'object' || item === null) continue;
            const itemType = (item as { type?: string }).type;
            if (itemType !== 'tool_use') continue;
            toolCount++;
            const name = (item as { name?: string }).name;
            if (name) toolBreakdown[name] = (toolBreakdown[name] ?? 0) + 1;
          }
        }
      } else if (obj.type === 'user' && isRealUserMessage(obj)) {
        userCount++;
      }
    }
  } finally {
    rl.close();
    stream.destroy();
  }

  return {
    userCount,
    assistantCount: assistantIds.size,
    toolCount,
    toolBreakdown,
  };
};

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const jsonlPath = req.query.jsonlPath as string;
  if (!jsonlPath) {
    return res.status(400).json({ error: 'jsonlPath parameter required' });
  }

  if (!isAllowedJsonlPath(jsonlPath)) {
    return res.status(403).json({ error: 'Path not allowed' });
  }

  try {
    const st = await stat(jsonlPath);
    const mtime = Math.floor(st.mtimeMs);
    const size = st.size;

    const cached = cacheGet(jsonlPath, mtime, size);
    if (cached) return res.status(200).json(cached);

    const counts = await countMessages(jsonlPath);
    cacheSet(jsonlPath, counts, mtime, size);
    return res.status(200).json(counts);
  } catch {
    return res.status(200).json({ userCount: 0, assistantCount: 0, toolCount: 0, toolBreakdown: {} });
  }
};

export default handler;
