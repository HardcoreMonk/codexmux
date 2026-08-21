# Timeline Status Module Split Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the approved timeline/status module split by extracting pure, testable helpers without changing public WebSocket/API behavior.

**Architecture:** Phase 1 only moves pure logic out of `timeline-server.ts` and `status-manager.ts`. It does not change `/api/timeline`, `/api/status`, Runtime v2 modes, watcher ownership, notification ownership, or rollback behavior. Later phases can split file watcher/subscription/resume and status poll/notification services after this safety layer is landed.

**Tech Stack:** TypeScript, Vitest, existing Pages Router/custom server runtime, existing timeline/status helper patterns.

---

## File Structure

- Create: `src/lib/timeline/init-metadata.ts`
  Pure helpers for timeline init metadata and last user message extraction.
- Create: `tests/unit/lib/timeline-init-metadata.test.ts`
  Unit tests for metadata counts, custom title, first timestamp override, and last user message truncation.
- Modify: `src/lib/timeline-server.ts`
  Import timeline init helpers and remove local duplicate helper code.
- Create: `src/lib/status/jsonl-idle-scan.ts`
  Pure helpers for JSONL idle scan and assistant/current-action extraction.
- Create: `tests/unit/lib/status-jsonl-idle-scan.test.ts`
  Unit tests for stop hook completion, awaiting API stale thresholds, interrupted markers, tool call action extraction, and reset after new user message.
- Modify: `src/lib/status-manager.ts`
  Import status scan helpers and remove local duplicate helper code.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Document that timeline/status module split phase 1 moved pure extraction helpers only.
- Modify: `docs/FOLLOW-UP.md`
  Mark phase 1 split done and leave watcher/subscription/resume/notification service split as remaining work.

## Task 1: Extract Timeline Init Metadata Helpers

**Files:**
- Create: `src/lib/timeline/init-metadata.ts`
- Create: `tests/unit/lib/timeline-init-metadata.test.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Write timeline helper tests**

Create `tests/unit/lib/timeline-init-metadata.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  computeTimelineInitMeta,
  findLastTimelineUserMessage,
} from '@/lib/timeline/init-metadata';
import type { ITimelineEntry } from '@/types/timeline';

describe('timeline init metadata helpers', () => {
  it('computes init metadata from entries and first timestamp override', () => {
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'first' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
      { id: 'u2', type: 'user-message', timestamp: 3000, text: 'second' },
    ];

    expect(computeTimelineInitMeta({
      entries,
      fileSize: 123,
      firstTimestamp: '2026-05-06T00:00:00.000Z',
      customTitle: 'Session title',
    })).toEqual({
      createdAt: '2026-05-06T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:03.000Z',
      lastTimestamp: 3000,
      fileSize: 123,
      userCount: 2,
      assistantCount: 1,
      customTitle: 'Session title',
    });
  });

  it('falls back to null timestamps for empty entry sets', () => {
    expect(computeTimelineInitMeta({ entries: [], fileSize: 0 })).toEqual({
      createdAt: null,
      updatedAt: null,
      lastTimestamp: 0,
      fileSize: 0,
      userCount: 0,
      assistantCount: 0,
    });
  });

  it('returns the last user message and truncates long text', () => {
    const longText = 'x'.repeat(240);
    const entries: ITimelineEntry[] = [
      { id: 'u1', type: 'user-message', timestamp: 1000, text: 'first' },
      { id: 'a1', type: 'assistant-message', timestamp: 2000, markdown: 'reply' },
      { id: 'u2', type: 'user-message', timestamp: 3000, text: longText },
    ];

    const result = findLastTimelineUserMessage(entries);
    expect(result).toHaveLength(201);
    expect(result?.endsWith('…')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-metadata.test.ts
```

Expected: FAIL because `@/lib/timeline/init-metadata` does not exist yet.

- [ ] **Step 3: Add timeline helper implementation**

Create `src/lib/timeline/init-metadata.ts`:

```typescript
import type { IInitMeta, ITimelineEntry } from '@/types/timeline';

const MAX_USER_MESSAGE_LENGTH = 200;

export const findLastTimelineUserMessage = (entries: ITimelineEntry[]): string | null => {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.type === 'user-message' && entry.text.trim()) {
      const text = entry.text.trim();
      return text.length > MAX_USER_MESSAGE_LENGTH
        ? `${text.slice(0, MAX_USER_MESSAGE_LENGTH)}…`
        : text;
    }
  }
  return null;
};

export const computeTimelineInitMeta = ({
  entries,
  fileSize,
  firstTimestamp = null,
  customTitle,
}: {
  entries: ITimelineEntry[];
  fileSize: number;
  firstTimestamp?: string | null;
  customTitle?: string;
}): IInitMeta => {
  const firstEntry = entries[0];
  const lastEntry = entries[entries.length - 1];
  const lastTimestamp = lastEntry?.timestamp ?? 0;
  const meta: IInitMeta = {
    createdAt: firstTimestamp ?? (firstEntry ? new Date(firstEntry.timestamp).toISOString() : null),
    updatedAt: lastEntry ? new Date(lastEntry.timestamp).toISOString() : null,
    lastTimestamp,
    fileSize,
    userCount: entries.filter((entry) => entry.type === 'user-message').length,
    assistantCount: entries.filter((entry) => entry.type === 'assistant-message').length,
  };

  if (customTitle) meta.customTitle = customTitle;
  return meta;
};
```

- [ ] **Step 4: Update timeline-server imports and call sites**

In `src/lib/timeline-server.ts`, add:

```typescript
import {
  computeTimelineInitMeta,
  findLastTimelineUserMessage,
} from '@/lib/timeline/init-metadata';
```

Remove the local `MAX_USER_MESSAGE_LENGTH`, `findLastUserMessage`, and `computeInitMeta` declarations.

Replace local function calls:

```typescript
findLastUserMessage(newEntries)
```

with:

```typescript
findLastTimelineUserMessage(newEntries)
```

Replace:

```typescript
computeInitMeta(entries, fileSize, firstTimestamp, customTitle)
```

with:

```typescript
computeTimelineInitMeta({ entries, fileSize, firstTimestamp, customTitle })
```

- [ ] **Step 5: Run timeline helper and timeline tests**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-metadata.test.ts tests/unit/lib/timeline-entry-dedupe.test.ts tests/unit/lib/timeline-entry-merge.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
```

Expected: PASS.

## Task 2: Extract Status JSONL Idle Scan Helpers

**Files:**
- Create: `src/lib/status/jsonl-idle-scan.ts`
- Create: `tests/unit/lib/status-jsonl-idle-scan.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write status scan tests**

Create `tests/unit/lib/status-jsonl-idle-scan.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  extractStatusAssistantInfo,
  scanStatusJsonlLines,
} from '@/lib/status/jsonl-idle-scan';

const line = (value: unknown): string => JSON.stringify(value);

describe('status JSONL idle scan helpers', () => {
  it('marks stop hook summaries as idle', () => {
    expect(scanStatusJsonlLines([
      line({ type: 'system', subtype: 'stop_hook_summary', timestamp: '2026-05-06T00:00:00.000Z' }),
    ], 0)).toMatchObject({
      matched: true,
      idle: true,
      stale: false,
      interrupted: false,
    });
  });

  it('keeps recent user messages as stale but not idle before awaiting-api threshold', () => {
    expect(scanStatusJsonlLines([
      line({ type: 'user', timestamp: '2026-05-06T00:00:00.000Z', message: { content: [{ type: 'text', text: 'run' }] } }),
    ], 10_000)).toMatchObject({
      matched: true,
      idle: false,
      stale: true,
      needsStaleRecheck: true,
      staleMs: 90_000,
    });
  });

  it('marks interrupted user marker as idle', () => {
    expect(scanStatusJsonlLines([
      line({ type: 'user', timestamp: '2026-05-06T00:00:00.000Z', message: { content: [{ type: 'text', text: '[Request interrupted by user]' }] } }),
    ], 0)).toMatchObject({
      matched: true,
      idle: true,
      interrupted: true,
    });
  });

  it('extracts current tool action from assistant content', () => {
    expect(extractStatusAssistantInfo([
      line({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'checking' },
            { type: 'tool_use', name: 'Read', input: { file_path: 'server.ts' } },
          ],
        },
      }),
    ])).toMatchObject({
      currentAction: {
        toolName: 'Read',
      },
      reset: false,
    });
  });

  it('resets assistant state when a newer non-tool user message appears', () => {
    expect(extractStatusAssistantInfo([
      line({ type: 'assistant', message: { content: [{ type: 'text', text: 'old answer' }] } }),
      line({ type: 'user', message: { content: [{ type: 'text', text: 'new prompt' }] } }),
    ])).toEqual({
      lastAssistantSnippet: null,
      currentAction: null,
      reset: true,
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm test tests/unit/lib/status-jsonl-idle-scan.test.ts
```

Expected: FAIL because `@/lib/status/jsonl-idle-scan` does not exist yet.

- [ ] **Step 3: Add status scan implementation**

Create `src/lib/status/jsonl-idle-scan.ts` by moving the existing pure logic from `status-manager.ts`:

```typescript
import type { ICurrentAction } from '@/types/status';
import type { TToolName } from '@/types/timeline';
import { INTERRUPT_PREFIX, summarizeToolCall } from '@/lib/session-parser';

const MAX_SNIPPET_LENGTH = 200;
const STALE_MS_INTERRUPTED = 20_000;
const STALE_MS_AWAITING_API = 90_000;

export interface IStatusAssistantExtract {
  lastAssistantSnippet: string | null;
  currentAction: ICurrentAction | null;
  reset: boolean;
}

export interface IStatusJsonlScanResult {
  matched: boolean;
  idle: boolean;
  stale: boolean;
  needsStaleRecheck: boolean;
  staleMs: number;
  lastEntryTs: number | null;
  interrupted: boolean;
}

const toCurrentAction = (block: { name?: string; input?: Record<string, unknown> }): ICurrentAction => {
  const toolName = (block.name ?? 'Tool') as TToolName;
  const input = (block.input ?? {}) as Record<string, unknown>;
  return { toolName, summary: summarizeToolCall(toolName, input) };
};

export const extractStatusAssistantInfo = (lines: string[]): IStatusAssistantExtract => {
  let userMessageSeen = false;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.isSidechain) continue;

      if (entry.type === 'user') {
        const c = entry.message?.content;
        const isToolResult = Array.isArray(c) && c.some((b: unknown) => (b as { type?: string }).type === 'tool_result');
        if (!isToolResult) userMessageSeen = true;
        continue;
      }

      if (entry.type !== 'assistant' || !entry.message?.content) continue;

      if (userMessageSeen) return { lastAssistantSnippet: null, currentAction: null, reset: true };

      const content = entry.message.content;
      if (!Array.isArray(content)) continue;

      let lastAssistantSnippet: string | null = null;
      let currentAction: ICurrentAction | null = null;

      for (let j = content.length - 1; j >= 0; j--) {
        const block = content[j];
        if (block.type === 'tool_use') {
          currentAction = toCurrentAction(block);
          break;
        }
        if (block.type === 'text' && block.text?.trim()) {
          const text = block.text.trim();
          currentAction = {
            toolName: null,
            summary: text.length > MAX_SNIPPET_LENGTH ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…` : text,
          };
          break;
        }
      }

      for (let j = content.length - 1; j >= 0; j--) {
        if (content[j].type === 'text' && content[j].text?.trim()) {
          const text = content[j].text.trim();
          lastAssistantSnippet = text.length > MAX_SNIPPET_LENGTH
            ? `${text.slice(0, MAX_SNIPPET_LENGTH)}…`
            : text;
          break;
        }
      }

      return { lastAssistantSnippet, currentAction, reset: false };
    } catch {
      continue;
    }
  }

  return { lastAssistantSnippet: null, currentAction: null, reset: false };
};

export const scanStatusJsonlLines = (lines: string[], elapsed: number): IStatusJsonlScanResult => {
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.isSidechain) continue;

      const entryTs: number | null = entry.timestamp ? new Date(entry.timestamp).getTime() : null;

      if (entry.type === 'system' && (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration')) {
        return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: false };
      }

      if (entry.type === 'assistant') {
        const stopReason = entry.message?.stop_reason;
        if (!stopReason) {
          const idle = elapsed > STALE_MS_INTERRUPTED;
          return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_INTERRUPTED, lastEntryTs: entryTs, interrupted: false };
        }
        return { matched: true, idle: stopReason !== 'tool_use', stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: false };
      }

      if (entry.type === 'user') {
        const content = entry.message?.content;
        if (Array.isArray(content) && content.length === 1 && typeof content[0]?.text === 'string' && content[0].text.startsWith(INTERRUPT_PREFIX)) {
          return { matched: true, idle: true, stale: false, needsStaleRecheck: false, staleMs: 0, lastEntryTs: entryTs, interrupted: true };
        }
        const idle = elapsed > STALE_MS_AWAITING_API;
        return { matched: true, idle, stale: true, needsStaleRecheck: !idle, staleMs: STALE_MS_AWAITING_API, lastEntryTs: entryTs, interrupted: false };
      }
    } catch {
      continue;
    }
  }

  return { matched: false, idle: elapsed > STALE_MS_AWAITING_API, stale: true, needsStaleRecheck: elapsed <= STALE_MS_AWAITING_API, staleMs: STALE_MS_AWAITING_API, lastEntryTs: null, interrupted: false };
};
```

- [ ] **Step 4: Update status-manager imports and call sites**

In `src/lib/status-manager.ts`, remove `INTERRUPT_PREFIX`, `summarizeToolCall`, and `TToolName` imports if they become unused.

Add:

```typescript
import {
  extractStatusAssistantInfo,
  scanStatusJsonlLines,
  type IStatusJsonlScanResult,
} from '@/lib/status/jsonl-idle-scan';
```

Delete the local `MAX_SNIPPET_LENGTH`, `toCurrentAction`, `IAssistantExtract`, `extractAssistantInfo`, `IScanResult`, and `scanLines` declarations.

Replace:

```typescript
const scan = scanLines(lines, elapsed);
const assistant = extractAssistantInfo(lines);
```

with:

```typescript
const scan = scanStatusJsonlLines(lines, elapsed);
const assistant = extractStatusAssistantInfo(lines);
```

Replace the local `IScanResult` type references with `IStatusJsonlScanResult`.

- [ ] **Step 5: Run status scan and status tests**

Run:

```bash
corepack pnpm test tests/unit/lib/status-jsonl-idle-scan.test.ts tests/unit/lib/status-state-machine.test.ts tests/unit/lib/status-session-mapping.test.ts tests/unit/lib/status-notification-policy.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
```

Expected: PASS.

## Task 3: Update Docs For Phase 1 Boundary

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update architecture module boundary**

In `docs/ARCHITECTURE-LOGIC.md`, update the module boundary table rows for Timeline and Status to mention the new pure helpers:

```markdown
| Timeline | `src/lib/timeline-server.ts`, `src/lib/timeline-server-state.ts`, `src/lib/timeline/init-metadata.ts` | Codex JSONL subscribe, file watch, resume, timeline init/append, init metadata helpers |
| Status | `src/lib/status-manager.ts`, `src/lib/status-server.ts`, `src/lib/status/jsonl-idle-scan.ts` | tab status polling, hook event merge, notification dispatch, JSONL idle scan helpers |
```

- [ ] **Step 2: Update follow-up status**

In `docs/FOLLOW-UP.md`, replace:

```markdown
- `timeline-server.ts`는 1차로 shared state를 분리했다. 다음 단계에서는 subscription service, file watcher service, resume service를 별도 파일로 더 나눈다.
- `status-manager.ts`는 순수 정책 helper를 분리했다. 다음 단계에서는 Web Push/history side effect adapter를 분리한다.
```

with:

```markdown
- `timeline-server.ts`는 shared state와 init metadata helper를 분리했다. 다음 단계에서는 subscription service, file watcher service, resume service를 별도 파일로 더 나눈다.
- `status-manager.ts`는 순수 정책 helper와 JSONL idle scan helper를 분리했다. 다음 단계에서는 poll service, pane recovery service, Web Push/history side effect adapter를 분리한다.
```

- [ ] **Step 3: Run docs grep**

Run:

```bash
rg -n "timeline/init-metadata|status/jsonl-idle-scan|init metadata helper|JSONL idle scan" docs/ARCHITECTURE-LOGIC.md docs/FOLLOW-UP.md
```

Expected: output includes both new helper paths and both follow-up descriptions.

## Task 4: Final Verification

**Files:**
- No new source edits after this task unless verification fails.

- [ ] **Step 1: Run focused tests**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-init-metadata.test.ts tests/unit/lib/status-jsonl-idle-scan.test.ts tests/unit/lib/timeline-entry-dedupe.test.ts tests/unit/lib/timeline-entry-merge.test.ts tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run broader status/timeline regression tests**

Run:

```bash
corepack pnpm test tests/unit/lib/status-state-machine.test.ts tests/unit/lib/status-session-mapping.test.ts tests/unit/lib/status-notification-policy.test.ts tests/unit/lib/status-side-effect-policy.test.ts tests/unit/lib/status-client-event-policy.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type check**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 5: Optional smoke after implementation**

Run if the local server is available:

```bash
corepack pnpm smoke:runtime-v2:timeline-websocket-default
corepack pnpm smoke:runtime-v2:status-default
```

Expected: PASS. If local server is unavailable, record that smoke was not run and do not claim live behavior verification.

- [ ] **Step 6: Commit checkpoint only after explicit user commit approval**

When the user explicitly requests commit:

```bash
git add src/lib/timeline/init-metadata.ts tests/unit/lib/timeline-init-metadata.test.ts src/lib/timeline-server.ts src/lib/status/jsonl-idle-scan.ts tests/unit/lib/status-jsonl-idle-scan.test.ts src/lib/status-manager.ts docs/ARCHITECTURE-LOGIC.md docs/FOLLOW-UP.md docs/superpowers/plans/2026-05-06-timeline-status-module-split-phase1.md
git commit -m "refactor: extract timeline and status helpers"
```

Expected: commit succeeds. Do not push unless the user explicitly asks.

## Self-Review

- Spec coverage: this is Workstream 2 Phase 1 only. It starts the module split with pure helper extraction and leaves watcher/subscription/resume/poll/notification service extraction to later phase plans.
- Placeholder scan: no task requires undefined files or vague implementation.
- Type consistency: plan uses existing `IInitMeta`, `ITimelineEntry`, `ICurrentAction`, and current status/timeline helper names.
- Rollback safety: public route names, WebSocket message shapes, Runtime v2 flags, and durable state remain unchanged.
