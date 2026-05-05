# Runtime V2 Status Side-effect Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Runtime v2 Status Worker side-effect intent shadowing without moving production status ownership.

**Architecture:** Extract a pure status side-effect policy used by legacy `StatusManager` and by Status Worker IPC. In `CODEXMUX_RUNTIME_STATUS_V2_MODE=shadow`, `StatusManager` compares worker intent to legacy intent and records sanitized counters only. Production polling, WebSocket broadcast, Web Push, ack/dismiss, JSONL watchers, and session history writes remain legacy-owned.

**Tech Stack:** TypeScript, Next.js Pages Router, Runtime v2 Supervisor/Worker IPC, Vitest, existing status reducer/policy helpers, `/api/debug/perf` counters.

---

## File Structure

- Create `src/lib/status-side-effect-policy.ts`
  - Pure boolean side-effect intent evaluator.
- Modify `src/lib/runtime/ipc.ts`
  - Add `status.evaluate-side-effects` payload/reply schemas.
- Modify `src/lib/runtime/contracts.ts`
  - Add side-effect input/result interfaces.
- Modify `src/lib/runtime/status/worker-service.ts`
  - Handle the new command.
- Modify `src/lib/runtime/supervisor.ts`
  - Add `evaluateStatusSideEffects()`.
- Modify `src/lib/status-manager.ts`
  - Compute legacy intent once, execute existing side effects from that intent, and shadow compare in status `shadow` mode.
- Modify `scripts/smoke-runtime-v2-status-shadow.ts`
  - Add side-effect intent smoke.
- Create `tests/unit/lib/status-side-effect-policy.test.ts`
  - Verify booleans for completion, needs-input, busy, and watcher cleanup.
- Modify `tests/unit/lib/runtime/status-worker-service.test.ts`
  - Verify worker side-effect command.
- Modify `tests/unit/lib/runtime/supervisor.test.ts`
  - Verify supervisor proxy.
- Modify docs:
  - `docs/STATUS.md`
  - `docs/RUNTIME-V2-CUTOVER.md`
  - `docs/FOLLOW-UP.md`

## Tasks

### Task 1: Pure Policy Tests

- [ ] Add tests proving side-effect intent for:
  - busy clears dismissed state and starts JSONL watch
  - ready-for-review saves history and review push only when dedupe accepted
  - needs-input sends needs-input push and starts JSONL watch
  - idle stops an existing non-Codex JSONL watch
- [ ] Run `corepack pnpm test tests/unit/lib/status-side-effect-policy.test.ts`.

### Task 2: Policy Implementation

- [ ] Implement `evaluateStatusSideEffects(input)` in `src/lib/status-side-effect-policy.ts`.
- [ ] Keep the result shape boolean-only.
- [ ] Re-run `corepack pnpm test tests/unit/lib/status-side-effect-policy.test.ts`.

### Task 3: Worker IPC

- [ ] Add `status.evaluate-side-effects` schemas to runtime IPC.
- [ ] Add contract types.
- [ ] Add Status Worker service test and implementation.
- [ ] Run `corepack pnpm test tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/worker-command-validation.test.ts`.

### Task 4: Supervisor Proxy

- [ ] Add `evaluateStatusSideEffects()` to `IRuntimeSupervisor`.
- [ ] Proxy the command through the status worker.
- [ ] Add unit coverage in `tests/unit/lib/runtime/supervisor.test.ts`.

### Task 5: StatusManager Shadow Integration

- [ ] Update `applyCliState()` to evaluate legacy intent once and execute current side effects from intent.
- [ ] Add shadow compare only when `CODEXMUX_RUNTIME_V2=1` and `CODEXMUX_RUNTIME_STATUS_V2_MODE=shadow`.
- [ ] Record match/mismatch/error counters without blocking status transitions.

### Task 6: Smoke And Docs

- [ ] Extend `corepack pnpm smoke:runtime-v2:status-shadow`.
- [ ] Update status/cutover/follow-up docs to describe side-effect shadow.
- [ ] Run focused tests, smoke, `tsc`, and `lint`.

## Self-Review

- Spec coverage: side-effect policy, worker IPC, manager integration, smoke, docs, and rollback are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: command name is `status.evaluate-side-effects`; status mode remains `shadow` for this slice.
