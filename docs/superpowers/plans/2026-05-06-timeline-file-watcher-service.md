# Timeline File Watcher Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split timeline watcher lifecycle and incremental append scheduling out of `timeline-server.ts`.

**Architecture:** `timeline-server.ts` keeps request/session orchestration and dependency wiring. `src/lib/timeline/file-watcher-service.ts` owns JSONL watch lifecycle, debounce, retry, incremental parse scheduling, append delivery fan-out, pending-change reprocessing, and watcher removal cleanup. Public `/api/timeline` WebSocket messages, Runtime v2 flags, shadow hooks, and status/layout side effects stay behavior-compatible through injected callbacks.

**Tech Stack:** TypeScript, Vitest, Node `fs.watch`, existing timeline server state types, existing provider contract.

---

## File Structure

- Create: `src/lib/timeline/file-watcher-service.ts`
  Service factory for `processFileChange`, `startFileWatch`, and `removeFileWatcher`.
- Create: `tests/unit/lib/timeline-file-watcher-service.test.ts`
  Unit tests for incremental append delivery, queued pending changes, debounce lifecycle, remove cleanup, and retry failure broadcast.
- Modify: `src/lib/timeline-server.ts`
  Replace local watcher functions with the service.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Add the watcher service to timeline module boundaries.
- Modify: `docs/FOLLOW-UP.md`
  Mark watcher lifecycle/incremental scheduling split complete.

## Task 1: Add Watcher Service Tests

**Files:**
- Create: `tests/unit/lib/timeline-file-watcher-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that import `createTimelineFileWatcherService` from `@/lib/timeline/file-watcher-service` and cover these exact cases:

```typescript
it('processes incremental entries and fans out append side effects', async () => {
  // Use a fake watcher, provider.parseIncremental, and fake socket; assert append, offset, pending buffer, live shadow, last message, and summary callbacks.
});

it('queues one pending process when a file change arrives while processing', async () => {
  // Use a gated parseIncremental promise; call processFileChange twice; resolve the first parse and assert the second parse runs.
});

it('debounces fs watch changes and removes watcher resources', async () => {
  // Use a fake watchFile and fake timers; assert parse waits for debounce and remove closes watcher, deletes the map entry, and stops live shadow.
});

it('retries watcher errors and broadcasts failure after retry budget is exhausted', async () => {
  // Use fake watcher error callbacks; assert one retry, watcher close, and watcher-failed broadcast after budget exhaustion.
});
```

- [ ] **Step 2: Run RED**

```bash
corepack pnpm test tests/unit/lib/timeline-file-watcher-service.test.ts
```

Expected: FAIL because `@/lib/timeline/file-watcher-service` does not exist yet.

## Task 2: Implement Watcher Service

**Files:**
- Create: `src/lib/timeline/file-watcher-service.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add service factory**

Create `createTimelineFileWatcherService(deps)` with:

- `processFileChange(fw: IFileWatcher): Promise<void>`
- `startFileWatch(fw: IFileWatcher): void`
- `removeFileWatcher(jsonlPath: string): void`

The implementation preserves the existing logic:

- If `fw.processing` is true, set `fw.pendingChange = true` and return.
- Clear `fw.tailSnapshot`, call `fw.provider.parseIncremental(fw.jsonlPath, fw.offset, fw.pendingBuffer)`.
- Record parse duration/count and total process duration.
- Store `pendingBuffer`, advance `fw.offset` only when `newEntries.length > 0`.
- Use `planTimelineAppendDelivery` and `readBoundedTimelineEntries` for full/partial fan-out.
- Call injected `onLiveShadowAppend`, `onLastUserMessage`, `resolveAgentSummary`, and `onAgentSummary` callbacks.
- In `finally`, clear `processing`; if `pendingChange` is set, clear it and schedule another `processFileChange`.
- `startFileWatch` uses injected `watchFile`, debounce timer, retry count, watcher close, and watcher failure broadcast.
- `removeFileWatcher` closes watcher, clears debounce timer, deletes from the injected `fileWatchers` map, and calls `stopLiveShadow`.

- [ ] **Step 2: Wire service from `timeline-server.ts`**

Instantiate the service after `resolveAgentSummary` and replace local calls:

```typescript
const timelineFileWatcherService = createTimelineFileWatcherService({
  debounceMs: DEBOUNCE_MS,
  maxWatcherRetries: MAX_WATCHER_RETRIES,
  fileWatchers,
  canSend,
  broadcastWatcher: broadcastToWatcher,
  onLiveShadowAppend: recordRuntimeTimelineLiveShadowAppend,
  stopLiveShadow: (jsonlPath) => stopRuntimeTimelineLiveShadow({ jsonlPath }),
  onLastUserMessage: async (sessionName, message) => {
    await updateTabLastUserMessage(sessionName, message).catch(() => {});
    notifyStatusLastUserMessage(sessionName, message);
  },
  resolveAgentSummary,
  onAgentSummary: async (sessionName, provider, summary) => {
    await updateTabAgentSummary(sessionName, provider, summary).catch(() => {});
  },
});
```

Use `timelineFileWatcherService.processFileChange`, `.startFileWatch`, and `.removeFileWatcher`.

- [ ] **Step 3: Run GREEN**

```bash
corepack pnpm test tests/unit/lib/timeline-file-watcher-service.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update timeline module boundaries and follow-up backlog to show watcher lifecycle/incremental scheduling has moved into `src/lib/timeline/file-watcher-service.ts`.

- [ ] **Step 2: Run regression**

```bash
corepack pnpm test tests/unit/lib/timeline-file-watcher-service.test.ts tests/unit/lib/timeline-init-message.test.ts tests/unit/lib/timeline-append-delivery.test.ts tests/unit/lib/timeline-file-read-service.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: completes the requested watcher lifecycle/incremental scheduling split while preserving public timeline behavior.
- Placeholder scan: test bodies and implementation steps point to exact behavior and files; no durable behavior change is deferred.
- Type consistency: service uses existing `IFileWatcher`, `IAgentProvider`, `TTimelineServerMessage`, and existing helper names.
