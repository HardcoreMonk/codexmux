# Runtime V2 Full Default And Ops Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish runtime v2 defaulting and operations/approval hardening through independent, rollbackable slices.

**Architecture:** Do not change terminal, storage, timeline, status, approval audit, and lifecycle execution in one commit. Start with Phase 4 Timeline v2 live shadow, then Timeline default, then Phase 5 Status side effects, then approval/perf/lifecycle slices. Every slice must update docs and include rollback evidence.

**Tech Stack:** TypeScript, Next.js Pages Router, custom Node WebSocket server, runtime v2 Supervisor/Worker IPC, tmux, Codex JSONL, Vitest, Playwright/Android/Electron smoke commands.

---

## File Structure

- Modify `docs/FOLLOW-UP.md`, `docs/RUNTIME-V2-CUTOVER.md`, and `docs/operations/2026-05-05-runtime-v2-live-new-tabs-default-handoff.md`
  - Mark observation closeout accurately as operator-approved.
- Create `docs/operations/2026-05-05-runtime-v2-observation-closeout.md`
  - Record evidence and caveat for the operator closeout.
- Modify `src/lib/runtime/timeline/worker-service.ts`
  - Add live watcher service in a later Phase 4 implementation plan.
- Modify `src/workers/timeline-worker.ts`
  - Forward timeline worker events to Supervisor in a later Phase 4 implementation plan.
- Modify `src/lib/runtime/supervisor.ts` and `src/lib/runtime/ipc.ts`
  - Add timeline subscription commands/events in a later Phase 4 implementation plan.
- Modify `src/lib/timeline-server.ts` and `src/lib/timeline-server-state.ts`
  - Add shadow/default routing once worker event parity exists.
- Modify `src/hooks/use-timeline-websocket.ts`, `src/hooks/use-timeline.ts`, `src/hooks/use-message-counts.ts`, `src/hooks/use-session-list.ts`
  - Use v2 routes only after server-side Phase 4 default evidence exists.

## Task 1: Observation Closeout Documentation

- [x] Capture live evidence from `/api/health`, `/api/v2/runtime/health`, `/api/debug/perf`, `systemctl --user show codexmux.service`, and warning journal.
- [x] Record that 2026-05-05 14:20 KST closeout is operator-approved and not an elapsed-time pass against the original 2026-05-06 01:42 KST clock gate.
- [x] Update follow-up and runtime cutover docs.
- [ ] Run `git diff --check`.

## Task 2: Phase 4 Timeline v2 Live Shadow Spec

- [x] Create `docs/superpowers/specs/2026-05-05-runtime-v2-timeline-live-shadow-design.md`.
- [x] Define the worker-owned event model:
  - `timeline.live-subscribe`
  - `timeline.live-unsubscribe`
  - subscribe reply `timeline:init`
  - `timeline.live-append`
  - `timeline.live-error`
- [x] Define sanitized shadow mismatch counters:
  - entry count mismatch
  - entry type sequence mismatch
  - byte offset mismatch
  - session id mismatch
  - no entry text or prompt body in mismatch output
- [x] Define rollback:
  - `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`
  - legacy `/api/timeline` remains client-facing
  - worker subscriptions are stopped on service restart

## Task 3: Phase 4 Timeline v2 Live Shadow Implementation Plan

- [x] Create `docs/superpowers/plans/2026-05-05-runtime-v2-timeline-live-shadow.md`.
- [x] Include TDD tasks for:
  - worker subscription service unit tests
  - runtime IPC command/event validation tests
  - timeline server shadow compare helper tests
  - WebSocket reconnect behavior tests where practical
  - smoke script for long JSONL append
- [x] Include verification:
  - `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/lib/timeline-entry-dedupe.test.ts tests/unit/lib/timeline-entry-merge.test.ts`
  - `corepack pnpm smoke:runtime-v2:timeline-shadow`
  - new `corepack pnpm smoke:runtime-v2:timeline-live-shadow`
  - `corepack pnpm tsc --noEmit`
  - `corepack pnpm lint`
  - `corepack pnpm build`

## Task 3a: Phase 4 Timeline v2 Live Shadow First Code Slice

- [x] Add runtime IPC contracts for `timeline.live-subscribe`, `timeline.live-unsubscribe`, `timeline.live-append`, and `timeline.live-error`.
- [x] Add Timeline Worker live JSONL watcher/subscriber service with initial init reply and append event emission.
- [x] Add Supervisor live subscription API and event fan-out.
- [x] Hook legacy `/api/timeline` shadow mode to start/stop v2 live subscriptions and compare sanitized init/append metadata.
- [x] Verify focused runtime unit tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm smoke:runtime-v2:timeline-shadow`, `corepack pnpm build`, and `git diff --check`.
- [ ] Add long JSONL append smoke before Timeline default promotion.

## Task 4: Phase 5 Status v2 Side-effect Spec

- [ ] Create a separate spec after Timeline Phase 4 shadow evidence is merged.
- [ ] Cover polling ownership, hook/statusline application, ack/dismiss, Web Push, session history writes, and singleton compatibility.
- [ ] Keep notification payload redaction and approval metadata boundaries from `docs/ADR.md`.

## Task 5: Approval Workflow High-grade Spec

- [ ] Create a separate spec for mobile push copy/deep link.
- [ ] Create a separate spec for durable approval audit history.
- [ ] Audit history storage must contain only sanitized metadata, option index, outcome, timestamp, workspace/tab ids, and no raw terminal/prompt/command body.

## Task 6: Measurement-based Perf Tuning

- [ ] Capture a new perf snapshot before each perf change.
- [ ] Pick only one bottleneck per commit.
- [ ] Record before/after counters in `docs/operations/YYYY-MM-DD-*-handoff.md`.
- [ ] Do not start full virtualization, adaptive polling, or terminal protocol changes without measured evidence.

## Task 7: Executable Lifecycle Control UI

- [ ] Write a dedicated spec before implementation.
- [ ] Require auth, confirmation, audit log, and failure recovery before adding buttons that edit systemd drop-ins, restart service, deploy, or rollback.
- [ ] Start with dry-run/copy command actions before direct execution.

## Current Next Step

Finish Task 3a verification/docs, then add the long JSONL append smoke. Do not implement Timeline default, Status default, approval audit, or executable lifecycle controls in the same commit.
