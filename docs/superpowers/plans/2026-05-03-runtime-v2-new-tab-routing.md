# Runtime v2 New Tab Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route plain new terminal tabs through runtime v2 behind `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs`.

**Architecture:** The legacy JSON layout remains the UI source of truth. Runtime v2 storage gets an explicit mirror workspace/pane command for legacy ids, and the layout API appends the created `rtv2-` tab back into JSON with `runtimeVersion: 2`. Existing terminal components choose `/api/terminal` or `/api/v2/terminal` from tab runtime identity.

**Tech Stack:** TypeScript, Next.js Pages Router API routes, runtime v2 Supervisor/Storage Worker, Vitest.

---

## Files

- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `src/lib/runtime/storage/worker-service.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/layout-store.ts`
- Create: `src/lib/tab-session-cleanup.ts`
- Modify: `src/lib/terminal-websocket-url.ts`
- Modify: `src/components/features/workspace/pane-container.tsx`
- Modify: `src/components/features/mobile/mobile-surface-view.tsx`
- Modify: `src/pages/api/layout/pane/[paneId]/tabs/index.ts`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/TMUX.md`
- Test: `tests/unit/lib/runtime/worker-client.test.ts`
- Test: `tests/unit/lib/runtime/storage-repository.test.ts`
- Test: `tests/unit/lib/runtime/storage-worker-service.test.ts`
- Test: `tests/unit/lib/runtime/supervisor.test.ts`
- Test: `tests/unit/lib/layout-store.test.ts`
- Test: `tests/unit/lib/terminal-websocket-url.test.ts`
- Create: `tests/unit/lib/tab-session-cleanup.test.ts`
- Create: `tests/unit/pages/layout-tabs-api.test.ts`

## Tasks

### Task 1: Preserve Runtime Version Through IPC

- [x] Add a failing worker-client test showing `storage.finalize-terminal-tab` reply keeps `runtimeVersion: 2`.
- [x] Add `runtimeVersion: z.literal(2)` to pending, ready, and layout tab IPC schemas.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime/worker-client.test.ts`.

### Task 2: Mirror Legacy Workspace/Panes Into Runtime Storage

- [x] Add failing repository and storage-worker tests for `storage.ensure-workspace-pane`.
- [x] Implement repository transaction, IPC schema/registry entry, and storage worker command.
- [x] Add supervisor support for optional `ensureWorkspacePane` before creating a terminal tab.
- [x] Run runtime storage and supervisor tests.

### Task 3: Append Runtime Tabs To Legacy JSON Layout

- [x] Add a failing layout-store test for appending an externally-created `runtimeVersion: 2` tab without creating a legacy tmux session.
- [x] Implement `addExistingTabToPane()`.
- [x] Add runtime-aware tab session cleanup helper and route layout close paths through it.
- [x] Run layout-store and cleanup helper tests.

### Task 4: Route Plain New Terminal Tabs Through Runtime v2

- [x] Add failing layout tab API tests for mode off, mode new-tabs, command fallback, and v2 cleanup on append failure.
- [x] Update `src/pages/api/layout/pane/[paneId]/tabs/index.ts` to use runtime v2 only for plain terminal tabs.
- [x] Run `corepack pnpm vitest run tests/unit/pages/layout-tabs-api.test.ts`.

### Task 5: Select The Existing Terminal Surface Endpoint By Runtime Version

- [x] Add a failing terminal URL helper test for `resolveTerminalWebSocketEndpoint({ runtimeVersion: 2 })`.
- [x] Implement endpoint resolver in `src/lib/terminal-websocket-url.ts`.
- [x] Update desktop and mobile terminal surfaces to pass the resolved endpoint to `useTerminalWebSocket()`.
- [x] Run terminal URL helper tests and `corepack pnpm tsc --noEmit`.

### Task 6: Documentation

- [x] Document that new-tab routing stores v2 tabs back into legacy JSON during Phase 2.
- [x] Document that command/resume/non-terminal tabs remain legacy in this slice.
- [x] Document runtime-aware cleanup behavior.

### Task 7: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run targeted unit tests for runtime IPC/storage/supervisor/layout/API/endpoint cleanup.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/pages/layout-tabs-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run runtime v2 smoke against temp HOME/DB.
- [ ] Commit, fast-forward merge to main, push, and clean up worktree.
