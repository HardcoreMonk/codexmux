# Runtime V2 Status Ack/Dismiss Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Status Worker shadow evaluation for needs-input ack and ready-for-review dismiss decisions.

**Architecture:** Extract a pure client-event policy, expose it through Runtime v2 IPC, and call it from legacy `StatusManager` only as non-blocking shadow compare. Legacy status WebSocket handlers remain production executors.

**Tech Stack:** TypeScript, Runtime v2 Supervisor/Worker IPC, Vitest, existing `/api/status` WebSocket path, perf counters.

---

## File Structure

- Create `src/lib/status-client-event-policy.ts`
  - Pure ack/dismiss acceptance and intent evaluator.
- Modify `src/lib/runtime/ipc.ts`
  - Add `status.evaluate-client-event` schemas.
- Modify `src/lib/runtime/contracts.ts`
  - Add client event input/result types.
- Modify `src/lib/runtime/status/worker-service.ts`
  - Handle the new command.
- Modify `src/lib/runtime/supervisor.ts`
  - Add `evaluateStatusClientEvent()`.
- Modify `src/lib/status-manager.ts`
  - Shadow compare dismiss and ack decisions before legacy execution.
- Modify `scripts/smoke-runtime-v2-status-shadow.ts`
  - Add client-event shadow checks.
- Create `tests/unit/lib/status-client-event-policy.test.ts`
  - Verify accepted/rejected dismiss and ack cases.
- Update status docs.

## Tasks

### Task 1: Pure Policy Tests

- [ ] Add tests for accepted dismiss, ignored dismiss, accepted ack, ignored ack with mismatched seq.
- [ ] Run `corepack pnpm test tests/unit/lib/status-client-event-policy.test.ts` and confirm it fails before implementation.

### Task 2: Policy Implementation

- [ ] Implement `evaluateStatusClientEvent(input)` returning boolean/string/null intent only.
- [ ] Re-run the policy test.

### Task 3: Runtime IPC

- [ ] Add `status.evaluate-client-event` command schema and contract types.
- [ ] Add Status Worker service handling and tests.
- [ ] Add Supervisor proxy and tests.

### Task 4: StatusManager Shadow Integration

- [ ] In `dismissTab()`, compute legacy intent, shadow compare, then run existing behavior.
- [ ] In `ackNotificationInput()`, compute legacy intent, shadow compare, then run existing behavior.
- [ ] Counter names must be `runtime_v2.status_shadow.client_event.{match,mismatch,error}`.

### Task 5: Smoke, Docs, Verification

- [ ] Extend `smoke:runtime-v2:status-shadow` with client event checks.
- [ ] Update `docs/STATUS.md`, `docs/RUNTIME-V2-CUTOVER.md`, `docs/RUNTIME-V2-PARITY.md`, `docs/TESTING.md`, `docs/FOLLOW-UP.md`.
- [ ] Run focused unit tests, status shadow smoke, `tsc`, `lint`, and `git diff --check`.

## Self-Review

- Spec coverage: ack/dismiss policy, worker IPC, supervisor proxy, StatusManager shadow, smoke, docs, and rollback are covered.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: command name is `status.evaluate-client-event`; production owner remains `StatusManager`.
