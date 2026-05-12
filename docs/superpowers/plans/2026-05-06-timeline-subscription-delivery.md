# Timeline Subscription Delivery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split timeline WebSocket send and watcher/stat broadcast delivery into a subscription delivery facade.

**Architecture:** `timeline-server.ts` keeps high-level session orchestration. `src/lib/timeline/subscription-delivery.ts` owns backpressure-gated `send`, watcher broadcast, and session stats broadcast over the existing `fileWatchers` singleton. Public `/api/timeline` message shapes and rollback behavior do not change.

**Tech Stack:** TypeScript, Vitest, existing `ws` WebSocket type, existing timeline server state.

---

## File Structure

- Create: `src/lib/timeline/subscription-delivery.ts`
  Facade for `send`, `broadcastWatcher`, and `broadcastSessionStats`.
- Create: `tests/unit/lib/timeline-subscription-delivery.test.ts`
  Unit tests for backpressure-gated sends, watcher broadcast, missing watcher no-op, and session stats filtering.
- Modify: `src/lib/timeline-server.ts`
  Use the delivery facade instead of direct `sendTimelineJson`/`broadcastTimelineWatcher` imports and local stats fan-out.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Add subscription delivery facade to timeline module boundaries.
- Modify: `docs/FOLLOW-UP.md`
  Mark subscription delivery facade split complete.

## Task 1: Add Subscription Delivery Tests

**Files:**
- Create: `tests/unit/lib/timeline-subscription-delivery.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that import `createTimelineSubscriptionDelivery` from `@/lib/timeline/subscription-delivery` and verify:

```typescript
it('sends JSON only when the socket can send', () => {
  // canSend true serializes and sends the message; canSend false returns false and sends nothing.
});

it('broadcasts watcher messages to sendable watcher subscribers only', () => {
  // two fake sockets, one sendable; assert send count and serialized message.
});

it('treats missing watcher broadcast as a no-op', () => {
  // no watcher entry; assert count 0.
});

it('broadcasts session stats only to watchers whose JSONL path maps to the stats session id', () => {
  // two watcher entries with different jsonl paths; assert only matching watcher receives timeline:stats-update.
});
```

- [ ] **Step 2: Run RED**

```bash
corepack pnpm test tests/unit/lib/timeline-subscription-delivery.test.ts
```

Expected: FAIL because `@/lib/timeline/subscription-delivery` does not exist yet.

## Task 2: Implement Delivery Facade

**Files:**
- Create: `src/lib/timeline/subscription-delivery.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add facade implementation**

Create `createTimelineSubscriptionDelivery({ fileWatchers, canSend, getSessionIdFromJsonlPath })` with:

- `send(ws, message): boolean`
- `broadcastWatcher(jsonlPath, message): number`
- `broadcastSessionStats(stats): number`

The facade serializes messages with `JSON.stringify`, skips sockets where `canSend(ws)` is false, and returns the number of sockets that received a message.

- [ ] **Step 2: Wire facade from `timeline-server.ts`**

Instantiate once:

```typescript
const timelineDelivery = createTimelineSubscriptionDelivery({
  fileWatchers,
  canSend,
  getSessionIdFromJsonlPath: extractSessionIdFromJsonlPath,
});
```

Replace `sendJson(...)` with `timelineDelivery.send(...)`, watcher failure callback with `timelineDelivery.broadcastWatcher`, and `broadcastSessionStats` with `timelineDelivery.broadcastSessionStats(stats)`.

- [ ] **Step 3: Run GREEN**

```bash
corepack pnpm test tests/unit/lib/timeline-subscription-delivery.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update timeline module boundaries and follow-up notes to include `src/lib/timeline/subscription-delivery.ts`.

- [ ] **Step 2: Run regression**

```bash
corepack pnpm test tests/unit/lib/timeline-subscription-delivery.test.ts tests/unit/lib/timeline-file-watcher-service.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: completes subscription delivery facade candidate without changing client-facing timeline behavior.
- Placeholder scan: no deferred implementation remains.
- Type consistency: facade uses existing `IFileWatcher`, `ISessionStats`, and `TTimelineServerMessage` types.
