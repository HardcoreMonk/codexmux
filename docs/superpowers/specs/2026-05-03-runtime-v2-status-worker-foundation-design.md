# Runtime v2 Status Worker Foundation Design

## Goal

Add a runtime v2 Status Worker process that evaluates status transition policy through typed IPC without replacing the production `StatusManager` WebSocket path yet.

## Scope

- Add `status-worker` as the fourth runtime v2 worker process.
- Add typed IPC commands:
  - `status.health`
  - `status.reduce-hook-state`
  - `status.reduce-codex-state`
  - `status.evaluate-notification-policy`
- Reuse existing pure status modules:
  - `status-state-machine`
  - `status-notification-policy`
- Start Status Worker from Supervisor and include it in runtime v2 health.
- Keep production `/api/status`, Web Push, session history, JSONL watchers, and layout persistence unchanged.

## Decisions

- Status Worker foundation is policy-only. It does not read tmux, watch JSONL, write layout metadata, or send notifications.
- The worker is still useful because status transitions, hook deferral, and notification gating become typed worker contracts before the later production cutover.
- Production status source of truth remains `StatusManager` until a separate cutover plan migrates live status polling/broadcast ownership.

## Verification

- Red/green unit tests for worker command handling.
- Runtime IPC command validation/path tests.
- Supervisor health and proxy method tests.
- Runtime v2 focused suite, `tsc`, `lint`, `build`, and runtime v2 smoke.
