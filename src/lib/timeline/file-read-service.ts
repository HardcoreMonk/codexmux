import { createReadStream } from 'fs';
import { open as fsOpen, stat as fsStat } from 'fs/promises';
import { createInterface } from 'readline';

import { getPerfNow, recordPerfCounter, recordPerfDuration } from '@/lib/perf-metrics';
import type { IAgentProvider } from '@/lib/providers';
import type { ITimelineTailSnapshot } from '@/lib/timeline-server-state';
import type { ITimelineEntry } from '@/types/timeline';

export const DEFAULT_TIMELINE_INIT_ENTRY_LIMIT = 64;

export interface ITimelineTailSnapshotStore {
  tailSnapshot?: ITimelineTailSnapshot;
}

interface IReadBoundedTimelineEntriesOptions {
  filePath: string;
  from: number;
  to: number;
  provider: Pick<IAgentProvider, 'parseJsonlContent'>;
}

interface IReadTimelineTailSnapshotOptions {
  store: ITimelineTailSnapshotStore;
  jsonlPath: string;
  provider: Pick<IAgentProvider, 'readTailEntries'>;
  maxEntries?: number;
}

export const readFirstTimelineTimestamp = async (filePath: string): Promise<string | null> => {
  let stream: ReturnType<typeof createReadStream> | null = null;
  try {
    stream = createReadStream(filePath, { encoding: 'utf-8', start: 0, end: 4096 });
    const rl = createInterface({ input: stream, crlfDelay: Infinity });
    try {
      for await (const line of rl) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as { timestamp?: unknown };
          if (obj.timestamp) {
            return new Date(obj.timestamp as string | number | Date).toISOString();
          }
        } catch {
          return null;
        }
        return null;
      }
    } finally {
      rl.close();
    }
  } catch {
    return null;
  } finally {
    stream?.destroy();
  }
  return null;
};

export const readBoundedTimelineEntries = async ({
  filePath,
  from,
  to,
  provider,
}: IReadBoundedTimelineEntriesOptions): Promise<ITimelineEntry[]> => {
  const readSize = to - from;
  if (readSize <= 0) return [];
  const handle = await fsOpen(filePath, 'r');
  try {
    const buf = Buffer.alloc(readSize);
    await handle.read(buf, 0, readSize, from);
    return provider.parseJsonlContent(buf.toString('utf-8'));
  } finally {
    await handle.close();
  }
};

export const readTimelineTailSnapshot = async ({
  store,
  jsonlPath,
  provider,
  maxEntries = DEFAULT_TIMELINE_INIT_ENTRY_LIMIT,
}: IReadTimelineTailSnapshotOptions): Promise<ITimelineTailSnapshot> => {
  const stat = await fsStat(jsonlPath);
  const cached = store.tailSnapshot;
  if (
    cached
    && cached.maxEntries === maxEntries
    && cached.fileSize === stat.size
    && cached.mtimeMs === stat.mtimeMs
  ) {
    recordPerfCounter('timeline.tail_cache_hit');
    return cached;
  }

  recordPerfCounter('timeline.tail_cache_miss');
  const startedAt = getPerfNow();
  const result = await provider.readTailEntries(jsonlPath, maxEntries);
  recordPerfDuration('timeline.read_tail', getPerfNow() - startedAt);
  recordPerfCounter('timeline.read_tail.entries', result.entries.length);

  const firstTimestamp = result.hasMore ? await readFirstTimelineTimestamp(jsonlPath) : null;
  const snapshot: ITimelineTailSnapshot = {
    maxEntries,
    fileSize: result.fileSize,
    mtimeMs: stat.mtimeMs,
    result,
    firstTimestamp,
  };
  store.tailSnapshot = snapshot;
  return snapshot;
};
