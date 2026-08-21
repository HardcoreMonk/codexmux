import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  readBoundedTimelineEntries,
  readFirstTimelineTimestamp,
  readTimelineTailSnapshot,
} from '@/lib/timeline/file-read-service';
import type { IChunkReadResult, ITimelineEntry } from '@/types/timeline';

const tmpDirs: string[] = [];

const writeTempJsonl = async (content: string): Promise<string> => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-timeline-read-'));
  tmpDirs.push(dir);
  const filePath = path.join(dir, 'session.jsonl');
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
};

const line = (value: unknown): string => JSON.stringify(value);

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tmpDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe('timeline file read service', () => {
  it('reads the first timestamp from the first non-empty JSONL line', async () => {
    const filePath = await writeTempJsonl([
      '',
      line({ timestamp: '2026-05-06T01:02:03.000Z', type: 'event_msg' }),
      line({ timestamp: '2026-05-06T01:02:04.000Z', type: 'event_msg' }),
    ].join('\n'));

    await expect(readFirstTimelineTimestamp(filePath)).resolves.toBe('2026-05-06T01:02:03.000Z');
  });

  it('parses only the requested byte range through the provider parser', async () => {
    const first = line({ timestamp: '2026-05-06T01:02:03.000Z', text: 'first' });
    const second = line({ timestamp: '2026-05-06T01:02:04.000Z', text: 'second' });
    const content = `${first}\n${second}\n`;
    const filePath = await writeTempJsonl(content);
    const from = Buffer.byteLength(`${first}\n`, 'utf-8');
    const to = Buffer.byteLength(content, 'utf-8');
    const entries: ITimelineEntry[] = [
      { id: 'u2', type: 'user-message', timestamp: 2000, text: 'second' },
    ];
    const parseJsonlContent = vi.fn((raw: string) => {
      expect(raw).toBe(`${second}\n`);
      return entries;
    });

    await expect(readBoundedTimelineEntries({
      filePath,
      from,
      to,
      provider: { parseJsonlContent },
    })).resolves.toEqual(entries);
    expect(parseJsonlContent).toHaveBeenCalledTimes(1);
  });

  it('reuses tail snapshots when file size, mtime, and max entries match', async () => {
    const content = [
      line({ timestamp: '2026-05-06T01:02:03.000Z', type: 'event_msg' }),
      line({ timestamp: '2026-05-06T01:02:04.000Z', type: 'event_msg' }),
    ].join('\n');
    const filePath = await writeTempJsonl(content);
    const entries: ITimelineEntry[] = [
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
    ];
    const result: IChunkReadResult = {
      entries,
      startByteOffset: 0,
      fileSize: Buffer.byteLength(content, 'utf-8'),
      hasMore: true,
      errorCount: 0,
    };
    const readTailEntries = vi.fn(async () => result);
    const store = {};

    const first = await readTimelineTailSnapshot({
      store,
      jsonlPath: filePath,
      provider: { readTailEntries },
      maxEntries: 1,
    });
    const second = await readTimelineTailSnapshot({
      store,
      jsonlPath: filePath,
      provider: { readTailEntries },
      maxEntries: 1,
    });

    expect(second).toBe(first);
    expect(first.firstTimestamp).toBe('2026-05-06T01:02:03.000Z');
    expect(readTailEntries).toHaveBeenCalledTimes(1);

    await readTimelineTailSnapshot({
      store,
      jsonlPath: filePath,
      provider: { readTailEntries },
      maxEntries: 2,
    });
    expect(readTailEntries).toHaveBeenCalledTimes(2);
  });
});
