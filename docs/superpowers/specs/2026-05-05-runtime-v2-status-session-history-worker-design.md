# Runtime V2 Status Session History Worker Design

## Goal

Add Status Worker command ownership for session history add and dismiss timestamp updates, while keeping `StatusManager` as the live production caller and broadcaster.

## Current State

- `StatusManager.saveSessionHistory()` builds `ISessionHistoryEntry`, writes it through `addSessionHistoryEntry()`, then broadcasts `session-history:update`.
- `StatusManager.dismissTab()` updates dismissal through `updateSessionHistoryDismissedAt()`, then broadcasts the updated entry.
- Status Worker can shadow status policy, side-effect intent, and client-event intent, but it cannot execute session history writes.

## Scope

- Add Status Worker commands:
  - `status.add-session-history-entry`
  - `status.update-session-history-dismissed-at`
- Add a small session history action adapter so worker tests can inject a fake store.
- In `StatusManager`, keep legacy behavior for `off` and `shadow`; use worker session history commands only when `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`.
- Broadcast remains in `StatusManager` because `/api/status` WebSocket ownership has not moved yet.

## Non-goals

- Do not move polling or `/api/status` WebSocket ownership.
- Do not enable `CODEXMUX_RUNTIME_STATUS_V2_MODE=default` in live systemd.
- Do not add prompt/result/session history payloads to perf counters or logs.
- Do not move Web Push in this slice.

## Verification

- Unit tests for injected session history action adapter.
- Status Worker command tests.
- Supervisor proxy tests.
- Existing session history normalization tests.
- Focused verification:
  - `corepack pnpm test tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/session-history.test.ts`
  - `corepack pnpm tsc --noEmit`
  - `corepack pnpm lint`

## Rollback

Keep `CODEXMUX_RUNTIME_STATUS_V2_MODE=off` or `shadow`; legacy `StatusManager` continues writing session history directly. If `default` is tested and fails, switch the flag back to `off` or `shadow`.
