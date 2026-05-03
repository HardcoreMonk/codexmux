# Runtime v2 Startup Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Finish Phase 1 shadow-runtime startup diagnostics by making server startup call runtime health without blocking legacy startup.

**Architecture:** Add `runRuntimeStartupDiagnostic()` as a small wrapper around `supervisor.health()`. Server startup schedules that wrapper when `CODEXMUX_RUNTIME_V2=1`. RuntimeWorkerClient records health command counters into the existing worker diagnostics store, and `/api/debug/perf` exposes those fields through `services.runtimeWorkers`.

**Tech Stack:** TypeScript, custom Node server, runtime v2 Supervisor/Workers, Vitest.

---

## Files

- Create: `src/lib/runtime/startup-diagnostic.ts`
- Modify: `src/lib/runtime/worker-diagnostics.ts`
- Modify: `src/lib/runtime/worker-client.ts`
- Modify: `server.ts`
- Create: `tests/unit/lib/runtime/startup-diagnostic.test.ts`
- Modify: `tests/unit/lib/runtime/worker-diagnostics.test.ts`
- Modify: `tests/unit/lib/runtime/worker-client.test.ts`
- Modify: `tests/unit/pages/debug-perf.test.ts`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/superpowers/specs/2026-05-03-runtime-v2-startup-diagnostics-design.md`
- Create: `docs/superpowers/plans/2026-05-03-runtime-v2-startup-diagnostics.md`

## Tasks

### Task 1: TDD Startup Diagnostic Helper

- [x] Add failing tests for non-blocking health call and caught failure logging.
- [x] Implement `runRuntimeStartupDiagnostic()`.
- [x] Run startup diagnostic tests.

### Task 2: TDD Worker Health Counters

- [x] Add failing diagnostics and worker-client tests for health counters.
- [x] Add `healthChecks`, `healthFailures`, and `lastHealthAt` to worker diagnostics.
- [x] Instrument RuntimeWorkerClient health commands.
- [x] Run runtime diagnostics tests.

### Task 3: Server Startup Wire-Up

- [x] Replace startup `ensureStarted()` fire-and-forget with `runRuntimeStartupDiagnostic(getRuntimeSupervisor(), log)`.
- [x] Keep the call non-blocking.

### Task 4: Docs

- [x] Document startup health diagnostics and health counters in cutover/performance docs.
- [x] Keep parity docs aligned with Phase 1 gates.

### Task 5: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime/startup-diagnostic.test.ts tests/unit/lib/runtime/worker-diagnostics.test.ts tests/unit/lib/runtime/worker-client.test.ts tests/unit/pages/debug-perf.test.ts`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run runtime v2 smoke against temp HOME/DB.
- [ ] Commit, fast-forward merge to main, push, and clean up worktree.
