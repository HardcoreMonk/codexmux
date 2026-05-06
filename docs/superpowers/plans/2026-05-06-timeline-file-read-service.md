# Timeline File Read Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the approved timeline/status module split by extracting timeline JSONL read and tail snapshot cache helpers from `timeline-server.ts`.

**Architecture:** This slice does not change `/api/timeline`, WebSocket message shape, Runtime v2 flags, watcher ownership, resume flow, or notification behavior. `timeline-server.ts` keeps orchestration and file watcher lifecycle, while `src/lib/timeline/file-read-service.ts` owns bounded byte-range reads, first timestamp reads, and tail snapshot cache refresh.

**Tech Stack:** TypeScript, Vitest, Node fs/readline APIs, existing provider contract, existing perf metric helpers.

---

## File Structure

- Create: `src/lib/timeline/file-read-service.ts`
  Timeline JSONL read helpers: first timestamp read, bounded byte-range parse, tail snapshot cache.
- Create: `tests/unit/lib/timeline-file-read-service.test.ts`
  Unit tests for first timestamp extraction, bounded range parsing, and cache reuse by file size/mtime/max entries.
- Modify: `src/lib/timeline-server.ts`
  Import file read helpers and remove local duplicate read helpers.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Document the new timeline file read service boundary.
- Modify: `docs/FOLLOW-UP.md`
  Mark this phase 2 read/tail split complete and keep subscription, watcher lifecycle, and resume split as remaining work.

## Task 1: Add Timeline File Read Service Tests

**Files:**
- Create: `tests/unit/lib/timeline-file-read-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/lib/timeline-file-read-service.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-file-read-service.test.ts
```

Expected: FAIL because `@/lib/timeline/file-read-service` does not exist yet.

## Task 2: Extract File Read Helpers

**Files:**
- Create: `src/lib/timeline/file-read-service.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add minimal implementation**

Create `src/lib/timeline/file-read-service.ts`:

```typescript
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
```

- [ ] **Step 2: Replace local helpers in `timeline-server.ts`**

Remove local `MAX_INIT_ENTRIES`, `readBoundedEntries`, `readTailSnapshot`, and `readFirstTimestamp`. Import:

```typescript
import {
  DEFAULT_TIMELINE_INIT_ENTRY_LIMIT,
  readBoundedTimelineEntries,
  readTimelineTailSnapshot,
} from '@/lib/timeline/file-read-service';
```

Replace `readBoundedEntries(fw.jsonlPath, initOffset, newOffset, fw.provider)` with:

```typescript
readBoundedTimelineEntries({
  filePath: fw.jsonlPath,
  from: initOffset,
  to: newOffset,
  provider: fw.provider,
})
```

Replace `readTailSnapshot(fw, jsonlPath, provider)` with:

```typescript
readTimelineTailSnapshot({
  store: fw,
  jsonlPath,
  provider,
  maxEntries: DEFAULT_TIMELINE_INIT_ENTRY_LIMIT,
})
```

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-file-read-service.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update the architecture module table to include `src/lib/timeline/file-read-service.ts`.

Update Post-MVP architecture modularization to say phase 2 extracted timeline file read/tail snapshot helpers, while subscription service, watcher lifecycle service, and resume service remain.

- [ ] **Step 2: Run focused regression**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-file-read-service.test.ts tests/unit/lib/timeline-init-metadata.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: covers Workstream 2 timeline split by extracting the tail snapshot/read helper boundary without changing source of truth or public contracts.
- Placeholder scan: implementation details are bounded to existing fs/readline/provider APIs; no behavior change is deferred inside this slice.
- Type consistency: plan uses existing `ITimelineTailSnapshot`, `ITimelineEntry`, `IChunkReadResult`, and `IAgentProvider` provider methods.
