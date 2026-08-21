# Status JSONL Watch Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move JSONL watcher lifecycle and debounce scheduling out of `StatusManager`.

**Architecture:** `StatusJsonlWatchService` owns the watcher map, same-path no-op, path replacement, debounce timers, error cleanup, stop, and stop-all behavior. `StatusManager` keeps the JSONL state reconciliation in `onJsonlFileChange()` and delegates watcher lifecycle to the service.

**Tech Stack:** TypeScript, Node `fs.watch`, Vitest fake timers, existing status manager code.

---

### Task 1: Watch Service

**Files:**
- Create: `src/lib/status/jsonl-watch-service.ts`
- Test: `tests/unit/lib/status-jsonl-watch-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover debounced change delivery, same-path no-op, replacement close, stop cleanup, and watcher error cleanup.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-jsonl-watch-service.test.ts`
Expected: FAIL because `@/lib/status/jsonl-watch-service` does not exist.

- [ ] **Step 3: Implement service**

Create a dependency-injected service with `start(tabId, jsonlPath)`, `stop(tabId)`, `stopAll()`, `has(tabId)`, `size()`, and `keys()` methods.

- [ ] **Step 4: Connect StatusManager**

Replace the local `jsonlWatchers` map and direct `fs.watch` code with `StatusJsonlWatchService`, preserving current behavior and log messages.

- [ ] **Step 5: Verify**

Run:

```bash
corepack pnpm test tests/unit/lib/status-jsonl-watch-service.test.ts
corepack pnpm test tests/unit/lib/status-jsonl-watch-service.test.ts tests/unit/lib/status-poll-service.test.ts tests/unit/lib/status-pane-recovery-service.test.ts tests/unit/lib/status-session-history-persistence.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Expected: every command exits 0.
