# Runtime V2 Status Session History Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Status Worker execute session history add/update commands, guarded behind status default mode.

**Architecture:** Add command contracts and a worker-side action adapter around existing session history functions. `StatusManager` chooses worker-backed writes only in `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`; shadow/off continue the legacy write path.

**Tech Stack:** TypeScript, Runtime v2 IPC, existing `session-history.json` store, Vitest.

---

## File Structure

- Create `src/lib/runtime/status/session-history-actions.ts`
  - Injectable action adapter for add/update.
- Modify `src/lib/runtime/ipc.ts`
  - Add command schemas for add/update.
- Modify `src/lib/runtime/contracts.ts`
  - Add command payload/reply types.
- Modify `src/lib/runtime/status/worker-service.ts`
  - Handle session history add/update commands.
- Modify `src/lib/runtime/supervisor.ts`
  - Add proxy methods.
- Modify `src/lib/status-manager.ts`
  - Route session history writes through worker only in status default mode.
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

- [ ] Add failing tests for `status.add-session-history-entry` and `status.update-session-history-dismissed-at`.
- [ ] Add IPC payload validation tests for both commands.

### Task 2: Adapter And IPC Implementation

- [ ] Implement injectable session history action adapter.
- [ ] Add runtime IPC schemas and contract types.
- [ ] Implement worker service command handling.

### Task 3: Supervisor And StatusManager Integration

- [ ] Add supervisor proxy methods.
- [ ] In `saveSessionHistory()`, use worker only when status mode is `default`.
- [ ] In `dismissTab()`, use worker update only when status mode is `default`.
- [ ] Keep broadcasts in `StatusManager`.

### Task 4: Verification And Docs

- [ ] Run focused tests.
- [ ] Run `corepack pnpm tsc --noEmit`.
- [ ] Run `corepack pnpm lint`.
- [ ] Update docs to record session history worker command foundation.

## Self-Review

- Spec coverage: command contracts, worker execution, default-mode integration, docs, and rollback are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: command names are `status.add-session-history-entry` and `status.update-session-history-dismissed-at`.
