# Runtime v2 Shadow Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the Phase 0 runtime v2 parity matrix and Phase 1 shadow diagnostics foundation without changing production route ownership.

**Architecture:** RuntimeWorkerClient records sanitized lifecycle and command counters into a global diagnostics store. `/api/debug/perf` exposes the snapshot as an authenticated operational view. Documentation ties the counters to runtime v2 cutover gates and rollback checks.

**Tech Stack:** Next.js Pages Router, TypeScript, runtime v2 Supervisor/Workers, Vitest, existing `/api/debug/perf`.

---

## Files

- Create: `docs/RUNTIME-V2-PARITY.md`
- Create: `src/lib/runtime/worker-diagnostics.ts`
- Modify: `src/lib/runtime/worker-client.ts`
- Modify: `src/pages/api/debug/perf.ts`
- Modify: `tests/unit/lib/runtime/worker-client.test.ts`
- Create: `tests/unit/lib/runtime/worker-diagnostics.test.ts`
- Modify: `tests/unit/pages/debug-perf.test.ts`
- Modify: `docs/README.md`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/superpowers/specs/2026-05-03-runtime-v2-shadow-diagnostics-design.md`
- Create: `docs/superpowers/plans/2026-05-03-runtime-v2-shadow-diagnostics.md`

## Tasks

### Task 1: TDD Diagnostics Store

- [x] Add failing tests for worker diagnostics snapshot/reset and sanitized last error metadata.
- [x] Implement `src/lib/runtime/worker-diagnostics.ts`.
- [x] Run the new diagnostics store test.

### Task 2: TDD Worker Client Instrumentation

- [x] Add failing tests for request/reply counters, timeout counters, readiness failure counters, and restart counters.
- [x] Instrument `RuntimeWorkerClient` without changing request/reply behavior.
- [x] Run `tests/unit/lib/runtime/worker-client.test.ts`.

### Task 3: TDD Perf Snapshot Exposure

- [x] Add failing `/api/debug/perf` test for `services.runtimeWorkers`.
- [x] Expose `getRuntimeWorkerDiagnosticsSnapshot()` from `/api/debug/perf`.
- [x] Confirm sensitive-key smoke still passes.

### Task 4: Parity And Operating Docs

- [x] Create `docs/RUNTIME-V2-PARITY.md` with owner, v1 behavior, v2 behavior, gap, migration strategy, test command, and rollback behavior for each production surface.
- [x] Link parity and diagnostics in `docs/RUNTIME-V2-CUTOVER.md`, `docs/PERFORMANCE.md`, `docs/FOLLOW-UP.md`, and `docs/README.md`.
- [x] Check docs for placeholder tokens.

### Task 5: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime/worker-diagnostics.test.ts tests/unit/lib/runtime/worker-client.test.ts tests/unit/pages/debug-perf.test.ts`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run runtime v2 smoke against temp HOME/DB.
- [ ] Commit, fast-forward merge to main, and push.

## Self-Review

- Production defaults remain unchanged.
- Diagnostics expose only worker-level counters and sanitized errors.
- Parity matrix has no unchecked placeholder rows.
- Verification evidence is fresh before commit and push.
