# Runtime V2 Status Live Event Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the IPC and Supervisor event bridge needed for Status Worker live ownership.

**Architecture:** Add typed commands/events, Supervisor fan-out, and default-mode `/api/status` bridge. In `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`, Status Worker runs the StatusManager live state machine in a separate process and the server maps worker events back to the existing client protocol. `off`/`shadow` keep legacy fallback untouched.

**Tech Stack:** TypeScript, Runtime v2 IPC, Status Worker, Supervisor event fan-out, Vitest.

---

## File Structure

- Modify `src/lib/runtime/ipc.ts`
  - Add status live command/event schemas.
- Modify `src/lib/runtime/contracts.ts`
  - Add status live payload types.
- Modify `src/lib/runtime/status/worker-service.ts`
  - Add live start/stop/request-sync plus hook/client/register/remove/visibility commands.
- Modify `src/lib/runtime/supervisor.ts`
  - Add status event handler and subscription fan-out.
- Modify `src/lib/status-server.ts`, `src/pages/api/status/hook.ts`, and related route bridges.
  - Route status default mode through Status Worker live commands/events.
- Modify tests:
  - `tests/unit/lib/runtime/ipc.test.ts`
  - `tests/unit/lib/runtime/status-worker-service.test.ts`
  - `tests/unit/lib/runtime/supervisor.test.ts`

## Tasks

### Task 1: IPC Event Schemas

- [x] Add schemas for `status.sync`, `status.update`, `status.session-history-update`, `status.hook-event`, `status.error`, and `status.rate-limits-update`.
- [x] Add schemas for `status.live-start`, `status.live-stop`, `status.live-request-sync`, hook/client/register/remove/visibility/notify/poll commands.
- [x] Add validation tests.

### Task 2: Worker Skeleton

- [x] Add live state flag to Status Worker service.
- [x] `status.live-start` initializes worker-owned StatusManager and returns `{ started: true }`.
- [x] `status.live-stop` clears started state and shuts down worker-owned StatusManager.
- [x] `status.live-request-sync` returns sanitized tab map from worker-owned StatusManager.

### Task 3: Supervisor Fan-out

- [x] Add status event subscriber registry.
- [x] Add `subscribeStatusLive()`/`unsubscribeStatusLive()` methods.
- [x] Fan out status runtime events to matching subscribers.

### Task 4: Default Bridge

- [x] Route `/api/status` WebSocket default mode through Status Worker subscribe/request/client-event commands.
- [x] Route hook/poll, tab register/remove, last-user-message notify, and device visibility to `status.live-*` commands.
- [x] Start worker-owned status live manager during server startup in status default mode.

### Task 5: Verification

- [x] Run focused runtime tests.
- [x] Run `corepack pnpm smoke:runtime-v2:status-default`.
- [x] Run `corepack pnpm smoke:runtime-v2:status-shadow`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm test`.
- [x] Run `corepack pnpm build`.

## Self-Review

- Spec coverage: event schemas, worker live manager, supervisor fan-out, default bridge, tests, and rollback are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: live command names use `status.live-*`; realtime events use `status.*`.
