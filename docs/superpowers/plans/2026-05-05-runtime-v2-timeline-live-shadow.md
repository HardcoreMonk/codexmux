# Runtime V2 Timeline Live Shadow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add runtime v2 Timeline Worker live shadow subscriptions for init/append parity without changing the client-facing timeline WebSocket.

**Architecture:** Keep legacy `/api/timeline` as the real WebSocket. In `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`, legacy timeline resolution starts a worker live subscription for the same JSONL path and compares sanitized event shape/count/offset output. Worker failures never affect legacy client delivery.

**Tech Stack:** TypeScript, Node `fs.watch`, runtime v2 typed IPC, Next.js Pages Router custom server, `ws`, Vitest, existing Codex JSONL parser/provider helpers.

---

## File Structure

- Modify `src/lib/runtime/contracts.ts`
  - Add live timeline command input/result and event payload interfaces.
- Modify `src/lib/runtime/ipc.ts`
  - Register `timeline.live-subscribe`, `timeline.live-unsubscribe`, `timeline.live-append`, and `timeline.live-error` schemas.
- Modify `src/lib/runtime/timeline/worker-service.ts`
  - Add live watcher/subscriber service beside existing read commands.
- Modify `src/workers/timeline-worker.ts`
  - Allow worker service to emit events through `process.send`.
- Modify `src/lib/runtime/supervisor.ts`
  - Add methods to subscribe/unsubscribe live timeline shadow and receive worker events.
- Create `src/lib/runtime/timeline-live-shadow.ts`
  - Own sanitized shadow compare state and mismatch counters.
- Modify `src/lib/timeline-server.ts`
  - Start/stop shadow subscriptions when timeline mode is `shadow`.
  - Feed legacy init/append event summaries to shadow compare helper.
- Modify `src/lib/perf-metrics.ts` only if a new counter helper is required; prefer existing `recordPerfCounter`.
- Test `tests/unit/lib/runtime/timeline-worker-service.test.ts`
- Test `tests/unit/lib/runtime/timeline-live-shadow.test.ts`
- Test `tests/unit/lib/runtime/ipc.test.ts`
- Test `tests/unit/lib/runtime/supervisor.test.ts`
- Add smoke `scripts/smoke-runtime-v2-timeline-live-shadow.ts` in the next slice.
- Modify `package.json` in the next slice to add `smoke:runtime-v2:timeline-live-shadow`.
- Update docs after implementation:
  - `docs/RUNTIME-V2-CUTOVER.md`
  - `docs/RUNTIME-V2-PARITY.md`
  - `docs/TESTING.md`
  - `docs/operations/YYYY-MM-DD-runtime-v2-timeline-live-shadow-handoff.md`

## Task 1: IPC Contracts And Tests

- [x] Add failing IPC tests for valid/invalid `timeline.live-subscribe` and `timeline.live-unsubscribe`.
- [x] Expected valid payload shape:

```typescript
{
  subscriberId: 'sub-1',
  jsonlPath: '/home/user/.codex/sessions/2026/05/05/session.jsonl',
  sessionName: 'pt-ws-pane-tab',
  sessionId: 'session-id',
  panelType: 'codex',
}
```

- [x] Expected invalid cases:
  - missing `subscriberId`
  - non-string `jsonlPath`
  - unsupported event payload with raw `cwd`, `prompt`, `terminalOutput`, or `jsonlPath` in event diagnostics
- [x] Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/ipc.test.ts
```

Expected: fails until schemas are added.

## Task 2: Worker Live Service

- [x] Add failing tests in `tests/unit/lib/runtime/timeline-worker-service.test.ts`.
- [x] Cover:
  - subscribe reads tail and emits one `subscribe reply init`
  - appending a JSONL line emits `timeline.live-append`
  - unsubscribe removes subscriber and closes watcher when unused
  - forbidden path returns `timeline-jsonl-path-forbidden`
  - `close()` clears watchers and timers
- [x] Implement live service inside `src/lib/runtime/timeline/worker-service.ts`.
- [x] Keep existing read commands unchanged.
- [x] Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-worker-service.test.ts
```

Expected: passes.

## Task 3: Worker Event Emission

- [x] Change `createTimelineWorkerService` to accept an optional event callback.
- [x] In `src/workers/timeline-worker.ts`, pass `process.send?.(event)` as the callback.
- [x] Ensure emitted event envelopes use runtime IPC event validation.
- [x] Add tests proving command replies still work when events are emitted.

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/ipc.test.ts
```

Expected: passes.

## Task 4: Supervisor Subscription API

- [x] Add Supervisor methods:
  - `subscribeTimelineLive(input)`
  - `unsubscribeTimelineLive(subscriberId)`
- [x] Add worker event listener plumbing for timeline events.
- [x] Add tests in `tests/unit/lib/runtime/supervisor.test.ts` that:
  - sends subscribe command to timeline worker
  - records emitted init/append/error events
  - handles worker exit without throwing to legacy caller

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/supervisor.test.ts
```

Expected: passes.

## Task 5: Shadow Compare Helper

- [x] Create `src/lib/runtime/timeline-live-shadow.ts`.
- [x] Add helper APIs:
  - `startRuntimeTimelineLiveShadow(input)`
  - `recordRuntimeTimelineLiveShadowAppend(jsonlPath, entries)`
  - `stopRuntimeTimelineLiveShadow(input)`
- [x] Compare only:
  - event type
  - entry count
  - entry type sequence
  - session id
  - start/end byte offsets when available
- [x] Tests assert no prompt/body/markdown/tool args appear in mismatch output.

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-live-shadow.test.ts
```

Expected: passes.

## Task 6: Legacy Timeline Server Shadow Hook

- [x] In `src/lib/timeline-server.ts`, when `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`, start a v2 subscription after a JSONL path is resolved.
- [x] Feed legacy `timeline:init` and `timeline:append` summaries into the compare helper.
- [x] On watcher cleanup, unsubscribe the v2 subscription.
- [x] Ensure shadow failure logs only error code/class and does not close the legacy WebSocket.

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-live-shadow.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm tsc --noEmit
```

Expected: passes.

## Task 7: Smoke Script

- [ ] Add `scripts/smoke-runtime-v2-timeline-live-shadow.ts`.
- [ ] Add `smoke:runtime-v2:timeline-live-shadow` to `package.json`.
- [ ] Smoke flow:
  - start temp HOME/server with `CODEXMUX_RUNTIME_V2=1` and `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`
  - login
  - create a JSONL fixture under allowed Codex sessions path
  - open legacy `/api/timeline` WebSocket for a session
  - append user/assistant records
  - verify client receives `timeline:init` and `timeline:append`
  - query perf/debug or smoke-only endpoint for v2 shadow mismatch count 0
- [ ] Smoke output must not print prompt text, assistant text, cwd, JSONL path, or terminal output.

Run:

```bash
corepack pnpm smoke:runtime-v2:timeline-live-shadow
```

Expected: passes.

## Task 8: Documentation And Verification

- [x] Update `docs/RUNTIME-V2-CUTOVER.md` Phase 4 current state.
- [x] Update `docs/RUNTIME-V2-PARITY.md` Timeline rows.
- [x] Update `docs/TESTING.md` with the implemented unit/live-shadow scope.
- [x] Add operation handoff with command outputs and no sensitive payloads.
- [x] Run implemented-scope verification:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/timeline-live-shadow.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:timeline-shadow
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
git diff --check
```

Expected: all implemented-scope commands pass. `smoke:runtime-v2:timeline-live-shadow` remains Task 7.

## Out Of Scope For This Plan

- `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`
- moving resume command execution into Timeline Worker
- Status Worker side effects
- Web Push/session history ownership
- approval audit storage
- executable lifecycle control buttons
