# Runtime V2 Storage Tab Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime v2 single terminal tab deletion through Storage Worker, Supervisor cleanup, and a v2 API route.

**Architecture:** Storage Worker owns the SQLite mutation and returns terminal cleanup intent. Supervisor closes subscribers and kills the tmux session. The API route remains a thin authenticated Pages Router adapter.

**Tech Stack:** Next.js Pages Router, TypeScript, `zod`, `better-sqlite3`, runtime v2 IPC, Vitest.

---

## Files

- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `src/lib/runtime/storage/worker-service.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Create: `src/pages/api/v2/tabs/[tabId].ts`
- Modify: `tests/unit/lib/runtime/storage-repository.test.ts`
- Modify: `tests/unit/lib/runtime/storage-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `tests/unit/pages/runtime-v2-api.test.ts`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/DATA-DIR.md`

## Task 1: Storage Delete Command

- [ ] **Step 1: Add failing repository tests**

Test deleting a ready terminal tab returns its session, removes it from layout,
sets active tab to the next ready tab, and reorders remaining tabs. Test deleting
a failed tab returns no cleanup session. Test missing tab returns
`{ deleted: false, session: null }`.

- [ ] **Step 2: Add failing worker-service tests**

Test `storage.delete-terminal-tab` routes through the worker and returns the
repository result.

- [ ] **Step 3: Implement contracts, IPC, repository, worker service**

Add delete result contracts, `storage.delete-terminal-tab` registry entry, a
repository transaction, and worker-service routing.

## Task 2: Supervisor and API Route

- [ ] **Step 1: Add failing Supervisor tests**

Test successful delete closes subscribers and kills the returned session. Test
missing delete skips Terminal Worker IPC. Test invalid returned session is
reported as failed cleanup without tmux call.

- [ ] **Step 2: Add failing API route tests**

Test disabled/auth/method behavior and successful `DELETE /api/v2/tabs/:tabId`.

- [ ] **Step 3: Implement Supervisor method and API route**

Add `deleteTerminalTab(tabId)` to the interface and implementation. Add
`src/pages/api/v2/tabs/[tabId].ts`.

## Task 3: Docs and Verification

- [ ] **Step 1: Update docs**

Document runtime v2 single-tab delete ownership and cleanup.

- [ ] **Step 2: Run focused tests**

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/pages/runtime-v2-api.test.ts
```

- [ ] **Step 3: Run broader verification**

```bash
corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```
