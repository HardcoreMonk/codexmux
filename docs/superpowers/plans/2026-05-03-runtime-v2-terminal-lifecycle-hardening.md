# Runtime V2 Terminal Lifecycle Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the experimental runtime v2 terminal path with ready-tab tmux reconciliation and production-shaped reconnect behavior for the v2 diagnostic UI.

**Architecture:** Storage Worker becomes able to list ready terminal tabs and durably fail stale ready tabs. Terminal Worker exposes a non-pty `terminal.has-session` command. Supervisor runs pending-tab reconciliation first, then ready-tab reconciliation, before runtime v2 reports ready. The experimental runtime page uses a v2 wrapper around the existing terminal WebSocket hook so reconnect behavior is shared while the URL points to `/api/v2/terminal`.

**Tech Stack:** Next.js Pages Router, TypeScript, React hooks, `zod`, `ws`, `node-pty`, tmux, `better-sqlite3`, Vitest.

---

## Scope

This plan stays behind `CODEXMUX_RUNTIME_V2=1`. It does not replace production
`/api/terminal`, does not add terminal stdout replay, does not add browser kill,
and does not migrate Status or Timeline workers.

No commit or push is part of this plan. The project workflow requires explicit
user approval before committing or pushing.

## Files

- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `src/lib/runtime/storage/worker-service.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-service.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Create: `src/lib/terminal-websocket-url.ts`
- Modify: `src/hooks/use-terminal-websocket.ts`
- Create: `src/hooks/use-runtime-terminal-websocket.ts`
- Modify: `src/pages/experimental/runtime.tsx`
- Modify: `tests/unit/lib/runtime/storage-repository.test.ts`
- Modify: `tests/unit/lib/runtime/storage-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Create: `tests/unit/lib/terminal-websocket-url.test.ts`
- Modify: `docs/TMUX.md`
- Modify: `docs/ADR.md`

## Task 1: Storage Ready-Tab Lifecycle

**Files:**
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `src/lib/runtime/storage/worker-service.ts`
- Modify: `tests/unit/lib/runtime/storage-repository.test.ts`
- Modify: `tests/unit/lib/runtime/storage-worker-service.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add tests that create one ready tab, one pending tab, and one failed tab. Assert
`repo.listReadyTerminalTabs()` returns only the ready tab. Assert
`repo.failReadyTerminalTab({ id, reason })` changes the ready tab to failed so
layout projection omits it. Assert missing, pending, and already failed ids throw
`runtime-v2-ready-tab-not-found`.

- [ ] **Step 2: Write failing worker-service tests**

Add worker command tests for `storage.list-ready-terminal-tabs` and
`storage.fail-ready-terminal-tab`. The command payload is `{}` for list and
`{ id, reason }` for fail.

- [ ] **Step 3: Run failing storage tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts
```

Expected before implementation: failures for missing repository methods and
unsupported storage commands.

- [ ] **Step 4: Implement Storage contracts and repository methods**

Add:

```typescript
export interface IFailReadyTerminalTabInput {
  id: string;
  reason: string;
}
```

Add IPC commands:

```typescript
'storage.list-ready-terminal-tabs': { payload: emptyPayloadSchema, reply: z.array(runtimeTerminalTabSchema) },
'storage.fail-ready-terminal-tab': { payload: failReadyTerminalTabPayloadSchema, reply: z.object({ ok: z.boolean() }) },
```

Implement `readyTabNotFoundError()`, `listReadyTerminalTabs()`, and
`failReadyTerminalTab()` in the repository. The fail method must update exactly
one `ready` row to `failed`, set `failure_reason`, append
`tab.ready-reconciliation-failed`, and throw `runtime-v2-ready-tab-not-found`
otherwise.

- [ ] **Step 5: Implement worker-service routing**

Route the two new storage commands in
`src/lib/runtime/storage/worker-service.ts`, preserving structured errors.

- [ ] **Step 6: Run passing storage tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts
```

Expected: PASS.

## Task 2: Terminal Worker Session Presence

**Files:**
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-service.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`

- [ ] **Step 1: Write failing Terminal Worker tests**

Add service and runtime tests for `terminal.has-session`:

- existing tmux session returns `{ sessionName, exists: true }`
- missing tmux session returns `{ sessionName, exists: false }`
- the command does not call `node-pty.spawn`

- [ ] **Step 2: Run failing terminal tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected before implementation: unsupported command and missing runtime method
failures.

- [ ] **Step 3: Implement Terminal Worker contracts**

Add IPC command:

```typescript
'terminal.has-session': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalSessionSchema.extend({ exists: z.boolean() }) },
```

Extend `ITerminalWorkerRuntime` with:

```typescript
hasSession(sessionName: string): Promise<unknown>;
```

- [ ] **Step 4: Implement runtime and service handling**

In `terminal-worker-runtime.ts`, use `tmux -L codexmux-runtime-v2 has-session
-t <sessionName>`. Return `exists: false` only for normal missing-session
failures; keep invalid session-name validation and unexpected tmux errors
structured.

In `terminal-worker-service.ts`, route `terminal.has-session`.

- [ ] **Step 5: Run passing terminal tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected: PASS.

## Task 3: Supervisor Ready-Tab Reconciliation

**Files:**
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`

- [ ] **Step 1: Write failing Supervisor tests**

Add tests proving:

- startup reconciles stale pending tabs first, with existing behavior unchanged
- startup lists ready tabs after pending reconciliation
- ready tabs with `terminal.has-session` false are failed through Storage
- ready tabs with `terminal.has-session` true are not failed
- unexpected `terminal.has-session` errors keep `ensureStarted()` rejected and
  shut workers down for retry

- [ ] **Step 2: Run failing Supervisor tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/supervisor.test.ts
```

Expected before implementation: missing commands in fake worker command log.

- [ ] **Step 3: Implement reconciliation**

Replace the single `reconciledPendingTerminalTabs` guard with a broader startup
reconciliation guard. Implement:

```typescript
const reconcileTerminalTabs = async (): Promise<void> => {
  await reconcilePendingTerminalTabs();
  await reconcileReadyTerminalTabs();
};
```

`reconcileReadyTerminalTabs()` must request `storage.list-ready-terminal-tabs`,
validate session names with `parseRuntimeSessionNameOrNull()`, call
`terminal.has-session`, and call `storage.fail-ready-terminal-tab` for missing
or invalid ready tabs. Invalid ready session names must never be sent to tmux.

- [ ] **Step 4: Run passing Supervisor tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/supervisor.test.ts
```

Expected: PASS.

## Task 4: Runtime V2 Reconnect Hook

**Files:**
- Create: `src/lib/terminal-websocket-url.ts`
- Modify: `src/hooks/use-terminal-websocket.ts`
- Create: `src/hooks/use-runtime-terminal-websocket.ts`
- Modify: `src/pages/experimental/runtime.tsx`
- Create: `tests/unit/lib/terminal-websocket-url.test.ts`

- [ ] **Step 1: Write failing URL helper tests**

Test that `/api/terminal` and `/api/v2/terminal` URLs include `clientId`,
`session`, and optional `cols`/`rows`, preserve URL encoding, and switch to
`wss:` when the current page uses `https:`.

- [ ] **Step 2: Run failing URL helper tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/terminal-websocket-url.test.ts
```

Expected before implementation: module not found.

- [ ] **Step 3: Implement URL helper**

Create `src/lib/terminal-websocket-url.ts` with:

```typescript
export type TTerminalWebSocketEndpoint = '/api/terminal' | '/api/v2/terminal';
```

and helpers for stable client id and browser WebSocket URL construction.

- [ ] **Step 4: Parameterize production hook without changing default behavior**

Add optional `endpoint?: TTerminalWebSocketEndpoint` to
`IUseTerminalWebSocketOptions`. Default to `/api/terminal`. Replace inline URL
construction with the helper.

- [ ] **Step 5: Add v2 wrapper hook**

Create `src/hooks/use-runtime-terminal-websocket.ts` that calls
`useTerminalWebSocket({ ...options, endpoint: '/api/v2/terminal' })`.

- [ ] **Step 6: Update experimental runtime page**

Remove the raw `WebSocket` logic and use `useRuntimeTerminalWebSocket()`. Keep
the visible diagnostic surface unchanged: create tab, attach, send initial
`pwd\n`, append stdout to the `<pre>`, and display connected/reconnecting/closed
states through existing message keys.

- [ ] **Step 7: Run hook-adjacent tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/terminal-websocket-url.test.ts
```

Expected: PASS.

## Task 5: Documentation and Verification

**Files:**
- Modify: `docs/TMUX.md`
- Modify: `docs/ADR.md`

- [ ] **Step 1: Update docs**

Document that runtime v2 startup now reconciles ready terminal tabs against tmux
session presence and marks stale ready tabs failed. Keep stdout replay and
automatic resubscribe explicitly out of scope.

- [ ] **Step 2: Run focused tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/terminal-websocket-url.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run typecheck**

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

- [ ] **Step 5: Review diff**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/specs/2026-05-03-runtime-v2-terminal-lifecycle-hardening-design.md docs/superpowers/plans/2026-05-03-runtime-v2-terminal-lifecycle-hardening.md
```

Expected: only this follow-up's docs and runtime v2 lifecycle/reconnect files are
changed.
