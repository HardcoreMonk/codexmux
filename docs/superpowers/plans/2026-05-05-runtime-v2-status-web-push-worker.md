# Runtime V2 Status Web Push Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Status Worker execute Web Push sends in status default mode while preserving legacy fallback.

**Architecture:** Add a strict `status.send-web-push` IPC command and a worker action adapter. `StatusManager` continues building safe payloads and computing foreground visibility; worker sends only in status default mode.

**Tech Stack:** TypeScript, Runtime v2 IPC, `web-push`, existing VAPID/subscription stores, Vitest.

---

## File Structure

- Create `src/lib/runtime/status/web-push-actions.ts`
  - Injectable Web Push send adapter.
- Modify `src/lib/runtime/ipc.ts`
  - Add `status.send-web-push` schemas.
- Modify `src/lib/runtime/contracts.ts`
  - Add Web Push input/result types.
- Modify `src/lib/runtime/status/worker-service.ts`
  - Handle the new command.
- Modify `src/lib/runtime/supervisor.ts`
  - Add `sendStatusWebPush()`.
- Modify `src/lib/status-manager.ts`
  - Route Web Push through worker only in status default mode.
- Modify tests:
  - `tests/unit/lib/runtime/status-worker-service.test.ts`
  - `tests/unit/lib/runtime/supervisor.test.ts`
  - `tests/unit/lib/runtime/ipc.test.ts`
- Update docs:
  - `docs/STATUS.md`
  - `docs/RUNTIME-V2-CUTOVER.md`
  - `docs/RUNTIME-V2-PARITY.md`

## Tasks

### Task 1: Worker Command Tests

- [ ] Add tests for skipped visible-device send and successful background send through injected actions.
- [ ] Add IPC payload validation and extra-field rejection.

### Task 2: Adapter And IPC Implementation

- [ ] Implement Web Push action adapter with injected dependencies.
- [ ] Add runtime IPC schemas and contract types.
- [ ] Implement worker service command handling.

### Task 3: StatusManager Integration

- [ ] Keep existing payload construction in `StatusManager`.
- [ ] Pass `anyDeviceVisible` into worker command in default mode.
- [ ] Fall back to legacy Web Push send on worker failure.

### Task 4: Verification And Docs

- [ ] Run focused tests.
- [ ] Run `corepack pnpm tsc --noEmit`.
- [ ] Run `corepack pnpm lint`.
- [ ] Update docs with Web Push worker foundation.

## Self-Review

- Spec coverage: payload safety, foreground suppression, worker command, fallback, tests, docs, and rollback are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: command name is `status.send-web-push`.
