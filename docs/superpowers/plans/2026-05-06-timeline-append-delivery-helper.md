# Timeline Append Delivery Helper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Continue the approved timeline module split by extracting append delivery planning from `timeline-server.ts`.

**Architecture:** This slice keeps WebSocket send, partial JSONL read, Runtime v2 flags, and file watcher lifecycle in the existing server path. A new pure helper decides whether each subscriber should receive the current append, a bounded catch-up read, or nothing, and whether its init offset must be cleared.

**Tech Stack:** TypeScript, Vitest, existing timeline WebSocket server.

---

## File Structure

- Create: `src/lib/timeline/append-delivery.ts`
  Pure delivery planner for append subscribers with init-offset catch-up semantics.
- Create: `tests/unit/lib/timeline-append-delivery.test.ts`
  Unit tests for full delivery, backpressure skip, pending init offset, partial catch-up, and init-offset clearing.
- Modify: `src/lib/timeline-server.ts`
  Use the delivery plan inside `processFileChange`.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Document append delivery helper ownership.
- Modify: `docs/FOLLOW-UP.md`
  Mark append delivery planning split complete and keep watcher lifecycle/subscription service/resume as remaining work.

## Task 1: Add Append Delivery Planner Tests

**Files:**
- Create: `tests/unit/lib/timeline-append-delivery.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/lib/timeline-append-delivery.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { planTimelineAppendDelivery } from '@/lib/timeline/append-delivery';

describe('timeline append delivery planner', () => {
  it('sends current append to ready subscribers without init offsets', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 150,
      subscribers: [{ target: 'ws-1', canSend: true }],
    })).toEqual({
      actions: [{ kind: 'full', target: 'ws-1', clearInitOffset: false }],
    });
  });

  it('does not clear init offsets while subscriber is backpressured', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 150,
      subscribers: [{ target: 'ws-1', canSend: false, initOffset: 120 }],
    })).toEqual({ actions: [] });
  });

  it('waits when append does not pass the subscriber init offset', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 80,
      newOffset: 100,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 120 }],
    })).toEqual({ actions: [] });
  });

  it('plans a bounded catch-up read when append crosses a later init offset', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 100,
      newOffset: 180,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 140 }],
    })).toEqual({
      actions: [{ kind: 'partial', target: 'ws-1', from: 140, to: 180, clearInitOffset: true }],
    });
  });

  it('clears stale init offsets and sends the current append when previous offset already covered it', () => {
    expect(planTimelineAppendDelivery({
      previousOffset: 150,
      newOffset: 180,
      subscribers: [{ target: 'ws-1', canSend: true, initOffset: 140 }],
    })).toEqual({
      actions: [{ kind: 'full', target: 'ws-1', clearInitOffset: true }],
    });
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-append-delivery.test.ts
```

Expected: FAIL because `@/lib/timeline/append-delivery` does not exist yet.

## Task 2: Extract Append Delivery Planner

**Files:**
- Create: `src/lib/timeline/append-delivery.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add implementation**

Create `src/lib/timeline/append-delivery.ts`:

```typescript
export interface ITimelineAppendSubscriber<TTarget> {
  target: TTarget;
  canSend: boolean;
  initOffset?: number;
}

export type TTimelineAppendDeliveryAction<TTarget> =
  | { kind: 'full'; target: TTarget; clearInitOffset: boolean }
  | { kind: 'partial'; target: TTarget; from: number; to: number; clearInitOffset: true };

export interface IPlanTimelineAppendDeliveryOptions<TTarget> {
  previousOffset: number;
  newOffset: number;
  subscribers: ITimelineAppendSubscriber<TTarget>[];
}

export const planTimelineAppendDelivery = <TTarget>({
  previousOffset,
  newOffset,
  subscribers,
}: IPlanTimelineAppendDeliveryOptions<TTarget>): { actions: TTimelineAppendDeliveryAction<TTarget>[] } => {
  const actions: TTimelineAppendDeliveryAction<TTarget>[] = [];
  for (const subscriber of subscribers) {
    if (!subscriber.canSend) continue;
    const initOffset = subscriber.initOffset;
    if (initOffset !== undefined) {
      if (newOffset <= initOffset) continue;
      if (previousOffset < initOffset) {
        actions.push({
          kind: 'partial',
          target: subscriber.target,
          from: initOffset,
          to: newOffset,
          clearInitOffset: true,
        });
        continue;
      }
      actions.push({ kind: 'full', target: subscriber.target, clearInitOffset: true });
      continue;
    }
    actions.push({ kind: 'full', target: subscriber.target, clearInitOffset: false });
  }
  return { actions };
};
```

- [ ] **Step 2: Use it in `timeline-server.ts`**

Import:

```typescript
import { planTimelineAppendDelivery } from '@/lib/timeline/append-delivery';
```

Replace the subscriber loop in `processFileChange` with a plan computed from `fw.connections`, `canSend(ws)`, and `fw.initOffsets.get(ws)`. For full actions, clear init offset when requested and send the existing serialized append. For partial actions, clear init offset, call `readBoundedTimelineEntries`, and send the returned entries when non-empty and the socket can still send.

- [ ] **Step 3: Verify GREEN**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-append-delivery.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update the timeline module table and follow-up architecture modularization note to include append delivery planning extraction.

- [ ] **Step 2: Run regression**

Run:

```bash
corepack pnpm test tests/unit/lib/timeline-append-delivery.test.ts tests/unit/lib/timeline-file-read-service.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: advances Workstream 2 timeline split without changing public WebSocket behavior.
- Placeholder scan: no deferred implementation remains in this slice.
- Type consistency: helper is generic over subscriber target and keeps existing init-offset semantics.
