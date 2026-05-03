# Runtime v2 Timeline Worker Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the read-only Timeline Worker foundation to runtime v2 without replacing production timeline routes.

**Architecture:** Extend the runtime IPC registry and worker client to support a `timeline` worker. Supervisor starts Timeline Worker beside Storage and Terminal, exposes read-only timeline methods, and new `/api/v2/timeline/*` routes call those methods after existing runtime v2 auth. Timeline Worker reuses existing timeline/session helper modules for parsing and index reads.

**Tech Stack:** Next.js Pages Router, TypeScript, Node `child_process.fork`, `zod`, Vitest, existing Codex JSONL provider helpers.

---

## Files

- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/worker-client.ts`
- Modify: `src/lib/runtime/worker-paths.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/runtime/api-handler.ts`
- Create: `src/lib/runtime/timeline/worker-service.ts`
- Create: `src/workers/timeline-worker.ts`
- Create: `src/pages/api/v2/timeline/sessions.ts`
- Create: `src/pages/api/v2/timeline/entries.ts`
- Create: `src/pages/api/v2/timeline/message-counts.ts`
- Modify: `tsup.config.ts`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/ADR.md`
- Modify: `tests/unit/lib/runtime/worker-paths.test.ts`
- Modify: `tests/unit/lib/runtime/worker-command-validation.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `tests/unit/pages/runtime-v2-api.test.ts`
- Create: `tests/unit/lib/runtime/timeline-worker-service.test.ts`

## Tasks

### Task 1: Failing Tests

- [ ] Add Timeline Worker service tests that expect `timeline.health`, `timeline.message-counts`, forbidden path rejection, and older-entry reads.
- [ ] Add runtime v2 API tests that expect disabled/auth/method handling and successful `/api/v2/timeline/*` calls.
- [ ] Add worker path and command validation expectations for `timeline-worker`.
- [ ] Run:
  `corepack pnpm vitest run tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/worker-command-validation.test.ts tests/unit/pages/runtime-v2-api.test.ts`
  Expected: fails because Timeline Worker commands/routes are not implemented.

### Task 2: IPC And Worker Process

- [ ] Add timeline command payload/reply schemas to `runtimeCommandRegistry`.
- [ ] Allow `RuntimeWorkerClient` name `timeline`.
- [ ] Add `timeline-worker` to `TRuntimeWorkerName`, path tests, and `tsup.config.ts`.
- [ ] Create `src/workers/timeline-worker.ts` with the same parse/reply lifecycle pattern as Storage Worker.
- [ ] Run IPC/path tests and fix type errors.

### Task 3: Timeline Worker Service

- [ ] Implement `createTimelineWorkerService()` with local message count cache, defensive JSONL path validation, provider lookup, and existing session index helper reuse.
- [ ] Return route-compatible shapes for session pages, older entries, and message counts.
- [ ] Run `tests/unit/lib/runtime/timeline-worker-service.test.ts`.

### Task 4: Supervisor And API Surface

- [ ] Add Timeline Worker client creation/start/shutdown to Supervisor.
- [ ] Add Supervisor methods for `listTimelineSessions`, `readTimelineEntriesBefore`, and `getTimelineMessageCounts`.
- [ ] Add `/api/v2/timeline/sessions`, `/api/v2/timeline/entries`, and `/api/v2/timeline/message-counts` handlers.
- [ ] Keep method errors before Supervisor access and disabled responses before auth.
- [ ] Run runtime v2 API and Supervisor tests.

### Task 5: Docs And Verification

- [ ] Update architecture/storage/ADR docs to mention read-only Timeline Worker foundation.
- [ ] Run:
  `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/pages/timeline-sessions.test.ts tests/unit/lib/timeline-message-counts.test.ts`
- [ ] Run `corepack pnpm tsc --noEmit`.
- [ ] Run `corepack pnpm lint`.
- [ ] Run `corepack pnpm build`.
- [ ] Commit and fast-forward merge to main only after verification passes.

## Self-Review

- Spec coverage: all commands, worker process, Supervisor methods, v2 HTTP APIs, docs, and packaging entry are covered.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: command names use `timeline.*`; worker name is `timeline`; method names are Supervisor-owned and read-only.
