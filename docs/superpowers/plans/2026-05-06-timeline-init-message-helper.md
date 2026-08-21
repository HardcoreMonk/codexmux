# Timeline Init Message Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the approved timeline module split by extracting `timeline:init` payload construction from `timeline-server.ts`.

**Architecture:** This slice keeps WebSocket send, file watcher registration, stats loading, status notification, and Runtime v2 behavior unchanged. The new helper builds empty and populated init messages from already-resolved inputs.

**Tech Stack:** TypeScript, Vitest, existing timeline message types.

---

## File Structure

- Create: `src/lib/timeline/init-message.ts`
  Builds empty and populated `timeline:init` messages.
- Create: `tests/unit/lib/timeline-init-message.test.ts`
  Unit tests for empty init payloads, populated payload metadata, summaries, session stats, and jsonl path preservation.
- Modify: `src/lib/timeline-server.ts`
  Use the helper in `sendEmptyInit` and `subscribeToFile`.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Document init message helper ownership.
- Modify: `docs/FOLLOW-UP.md`
  Mark init message construction split complete.

## Task 1: Add Init Message Tests

**Files:**
- Create: `tests/unit/lib/timeline-init-message.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/lib/timeline-init-message.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  buildEmptyTimelineInitMessage,
  buildTimelineInitMessage,
} from '@/lib/timeline/init-message';
import type { IChunkReadResult, ISessionStats, ITimelineEntry } from '@/types/timeline';

describe('timeline init message helpers', () => {
  it('builds empty init messages without optional fields unless requested', () => {
    expect(buildEmptyTimelineInitMessage({ sessionId: 'session-1' })).toEqual({
      type: 'timeline:init',
      entries: [],
      sessionId: 'session-1',
      totalEntries: 0,
      startByteOffset: 0,
      hasMore: false,
    });

    expect(buildEmptyTimelineInitMessage({
      sessionId: '',
      jsonlPath: '/tmp/session.jsonl',
      isAgentStarting: true,
    })).toMatchObject({
      jsonlPath: '/tmp/session.jsonl',
      isAgentStarting: true,
    });
  });

  it('builds populated init messages with metadata, summary, and stats', () => {
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'hello' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
    ];
    const result: IChunkReadResult = {
      entries,
      startByteOffset: 42,
      fileSize: 200,
      hasMore: true,
      errorCount: 0,
      summary: 'Existing summary',
      customTitle: 'Custom title',
    };
    const sessionStats: ISessionStats = {
      sessionId: 'session-1',
      inputTokens: 10,
      outputTokens: 20,
    };

    expect(buildTimelineInitMessage({
      result,
      sessionId: 'session-1',
      jsonlPath: '/tmp/session.jsonl',
      firstTimestamp: '2026-05-06T00:00:00.000Z',
      sessionStats,
    })).toEqual({
      type: 'timeline:init',
      entries,
      sessionId: 'session-1',
      totalEntries: 2,
      startByteOffset: 42,
      hasMore: true,
      jsonlPath: '/tmp/session.jsonl',
      summary: 'Existing summary',
      meta: {
        createdAt: '2026-05-06T00:00:00.000Z',
        updatedAt: '1970-01-01T00:00:02.000Z',
        lastTimestamp: 2000,
        fileSize: 200,
        userCount: 1,
        assistantCount: 1,
        customTitle: 'Custom title',
      },
      sessionStats,
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-message.test.ts
```

Expected: FAIL because `@/lib/timeline/init-message` does not exist yet.

## Task 2: Extract Init Message Builder

**Files:**
- Create: `src/lib/timeline/init-message.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add implementation**

Create `src/lib/timeline/init-message.ts`:

```typescript
import { computeTimelineInitMeta } from '@/lib/timeline/init-metadata';
import type { IChunkReadResult, ISessionStats, ITimelineInitMessage } from '@/types/timeline';

interface IBuildEmptyTimelineInitMessageOptions {
  sessionId?: string;
  jsonlPath?: string;
  isAgentStarting?: boolean;
}

interface IBuildTimelineInitMessageOptions {
  result: IChunkReadResult;
  sessionId: string;
  jsonlPath: string;
  firstTimestamp?: string | null;
  sessionStats?: ISessionStats | null;
}

export const buildEmptyTimelineInitMessage = ({
  sessionId = '',
  jsonlPath,
  isAgentStarting = false,
}: IBuildEmptyTimelineInitMessageOptions = {}): ITimelineInitMessage => {
  const message: ITimelineInitMessage = {
    type: 'timeline:init',
    entries: [],
    sessionId,
    totalEntries: 0,
    startByteOffset: 0,
    hasMore: false,
  };
  if (jsonlPath !== undefined) message.jsonlPath = jsonlPath;
  if (isAgentStarting) message.isAgentStarting = true;
  return message;
};

export const buildTimelineInitMessage = ({
  result,
  sessionId,
  jsonlPath,
  firstTimestamp = null,
  sessionStats = null,
}: IBuildTimelineInitMessageOptions): ITimelineInitMessage => ({
  type: 'timeline:init',
  entries: result.entries,
  sessionId,
  totalEntries: result.entries.length,
  startByteOffset: result.startByteOffset,
  hasMore: result.hasMore,
  jsonlPath,
  summary: result.summary,
  meta: computeTimelineInitMeta({
    entries: result.entries,
    fileSize: result.fileSize,
    firstTimestamp,
    customTitle: result.customTitle,
  }),
  sessionStats,
});
```

- [ ] **Step 2: Use it in `timeline-server.ts`**

Import:

```typescript
import {
  buildEmptyTimelineInitMessage,
  buildTimelineInitMessage,
} from '@/lib/timeline/init-message';
```

Replace local empty init object creation and populated init object creation with these helpers.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-message.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update module boundary and follow-up notes to mention init message construction helper.

- [ ] **Step 2: Run regression**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-message.test.ts tests/unit/lib/timeline-append-delivery.test.ts tests/unit/lib/timeline-file-read-service.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: advances timeline split while preserving public `timeline:init` shape.
- Placeholder scan: no deferred implementation remains in this slice.
- Type consistency: helper returns existing `ITimelineInitMessage`.
