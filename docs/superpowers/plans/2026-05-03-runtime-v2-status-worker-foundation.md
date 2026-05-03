# Runtime v2 Status Worker Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the runtime v2 Status Worker foundation as a typed policy-evaluation worker without replacing production status delivery.

**Architecture:** Extend runtime IPC, WorkerClient, worker path resolution, tsup packaging, and Supervisor startup to include a `status` worker. Status Worker owns pure status decision commands by calling existing status helper modules. Existing `StatusManager` remains the production status owner.

**Tech Stack:** Next.js Pages Router, TypeScript, Node `child_process.fork`, `zod`, Vitest, existing status reducer and notification policy helpers.

---

## Files

- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/runtime/worker-client.ts`
- Modify: `src/lib/runtime/worker-paths.ts`
- Create: `src/lib/runtime/status/worker-service.ts`
- Create: `src/workers/status-worker.ts`
- Modify: `tsup.config.ts`
- Modify: `tests/unit/lib/runtime/worker-command-validation.test.ts`
- Modify: `tests/unit/lib/runtime/worker-paths.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Create: `tests/unit/lib/runtime/status-worker-service.test.ts`
- Modify: `docs/STATUS.md`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/ADR.md`

## Tasks

### Task 1: Failing Tests

- [ ] Add Status Worker service tests for health, hook reducer, Codex reducer, and notification policy.
- [ ] Add status namespace validation and `status-worker` path expectations.
- [ ] Add Supervisor tests for status health and status policy proxy methods.
- [ ] Run:
  `corepack pnpm vitest run tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/worker-command-validation.test.ts tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/supervisor.test.ts`
  Expected: fails because status commands and worker are not implemented.

### Task 2: IPC And Worker Process

- [ ] Register `status.*` payload/reply schemas.
- [ ] Allow `RuntimeWorkerClient` and worker path resolution to use `status`.
- [ ] Add `status-worker` to `tsup.config.ts`.
- [ ] Create `src/workers/status-worker.ts` with the existing worker parse/reply lifecycle.

### Task 3: Status Worker Service

- [ ] Implement `createStatusWorkerService()` around `reduceHookState`, `reduceCodexState`, and notification policy helpers.
- [ ] Validate commands with `validateWorkerCommandEnvelope({ workerName: 'status', namespace: 'status' })`.
- [ ] Return structured non-retryable failures for unsupported commands.

### Task 4: Supervisor Integration

- [ ] Add Status Worker client startup, readiness, shutdown, and health.
- [ ] Add Supervisor proxy methods for hook reduction, Codex reduction, and notification policy evaluation.
- [ ] Update runtime tests to inject fake status worker everywhere fake workers are used.

### Task 5: Docs And Verification

- [ ] Update `STATUS.md` to mark runtime v2 Status Worker foundation as policy-only.
- [ ] Update architecture/ADR docs.
- [ ] Run runtime focused tests.
- [ ] Run `corepack pnpm tsc --noEmit`.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm build`.
- [ ] Run runtime v2 smoke with a temp HOME/DB.
- [ ] Commit, merge, and push after verification.

## Self-Review

- Spec coverage: worker process, IPC schemas, Supervisor startup, docs, and verification are covered.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: command names use `status.*`; worker name is `status`; production `StatusManager` remains untouched.
