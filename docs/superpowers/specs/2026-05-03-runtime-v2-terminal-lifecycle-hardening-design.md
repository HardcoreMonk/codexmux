# Runtime v2 Terminal Lifecycle Hardening Design

Date: 2026-05-03
Status: Approved follow-up slice

## Purpose

This follow-up hardens the experimental runtime v2 terminal path enough to make
terminal reconnect and stale lifecycle behavior explicit before any production
route replacement work.

The previous slice proved worker-owned terminal attach, input, output, resize,
and cleanup behind `CODEXMUX_RUNTIME_V2=1`. It intentionally left production
terminal reconnect parity and ready-tab lifecycle reconciliation as follow-up
work. This slice closes the most important part of that gap without migrating
Timeline Worker, Status Worker, or the production `/api/terminal` route.

## Scope

In scope:

- Add Terminal Worker IPC support for checking whether a runtime v2 tmux session
  still exists.
- Add Storage Worker support for listing ready runtime v2 terminal tabs and
  marking a ready terminal tab failed.
- Extend Supervisor startup reconciliation so ready terminal tabs whose tmux
  sessions are gone become durable `failed` tabs before the runtime reports
  ready.
- Keep pending-tab reconciliation behavior unchanged: stale pending tabs are
  failed durably and matching tmux sessions are killed best-effort.
- Extract reusable terminal WebSocket client behavior so the experimental
  runtime v2 UI uses the same reconnect, foreground reconnect, heartbeat, input,
  web-input, and resize policy shape as the production terminal hook while
  connecting to `/api/v2/terminal`.
- Preserve existing production `/api/terminal` behavior.
- Update runtime terminal docs and ADRs to document the new v2 lifecycle policy.

Out of scope:

- Replacing production `/api/terminal`.
- Durable terminal byte replay.
- Automatic server-side resubscribe after Terminal Worker restart.
- User-initiated browser kill for v2 terminal sessions.
- Timeline Worker or Status Worker migration.
- Android/Electron packaging changes beyond existing runtime v2 compatibility.

## Decisions

### Ready Tab Reconciliation

`ensureStarted()` remains the runtime readiness gate. It must complete both
pending-tab and ready-tab reconciliation before setting `started = true`.

Ready terminal tabs are reconciled by listing Storage rows with
`panel_type = 'terminal'` and `lifecycle_state = 'ready'`, then asking Terminal
Worker `terminal.has-session` for each `sessionName`.

If `terminal.has-session` returns `{ exists: true }`, the tab stays ready.

If the command returns `{ exists: false }`, or fails with
`runtime-v2-terminal-session-not-found`, Supervisor marks the ready tab failed
with reason `startup reconciliation: tmux session missing`.

Any other Terminal Worker or Storage Worker error is fatal to `ensureStarted()`.
The runtime must not advertise readiness when it cannot prove terminal lifecycle
state.

### Failed Ready Tabs

Marking a ready terminal tab failed is a strict Storage transition:

- only `ready` tabs can be changed
- the update must affect exactly one row
- missing, pending, or already failed tabs return non-retryable
  `runtime-v2-ready-tab-not-found`
- failed tabs are omitted from layout projection and attach authorization

This keeps stale sessions out of the experimental UI after restart and makes the
failure visible through durable Storage state. A future terminal lifecycle plan
can add `closing` or `closed`; this slice only needs `failed` to avoid exposing
dead ready tabs.

### Terminal Worker Has Session

Terminal Worker adds `terminal.has-session` with payload `{ sessionName }` and
reply `{ sessionName, exists }`.

Invalid runtime session names continue to fail through the command registry
before tmux is invoked. Missing tmux sessions are not an exceptional condition
for `terminal.has-session`; they return `exists: false`. Unexpected tmux command
failures still return structured non-retryable errors.

### Runtime v2 Client Reconnect

The experimental runtime page must stop hand-rolling a raw WebSocket. It should
use a v2 hook built from the existing production reconnect policy:

- heartbeat every 30 seconds
- stable `clientId` stored in `sessionStorage`
- retry delays from `nextReconnectDelay()`
- `isRetriableTerminalClose()` for close-code classification
- foreground, focus, online, BFCache, and native app-state reconnect triggers
- `sendStdin()`, `sendWebStdin()`, and `sendResize()` helpers

The v2 hook differs only in URL shape:

```text
/api/v2/terminal?clientId=:clientId&session=:sessionName&cols=:cols&rows=:rows
```

`clientId` is diagnostic identity only. It is not an auth credential and does
not change server authorization. Query-string credentials remain forbidden by
the existing runtime v2 WebSocket auth helper.

Close-code behavior stays compatible with the first slice:

- `1000` means the session ended
- `1011` maps to `session-not-found` or non-retryable terminal failure
- `1013` maps to `max-connections`
- other retriable close codes use exponential backoff

### Promotion Boundary

After this slice, runtime v2 still remains experimental behind
`CODEXMUX_RUNTIME_V2=1`. The production replacement gate is not open until
Status/Timeline parity and native platform reconnect smoke are implemented in
separate follow-up plans.

## Acceptance Criteria

- Unit tests prove `storage.list-ready-terminal-tabs` returns only ready terminal
  tabs.
- Unit tests prove `storage.fail-ready-terminal-tab` marks ready tabs failed and
  rejects pending, missing, and already failed tabs with
  `runtime-v2-ready-tab-not-found`.
- Unit tests prove `terminal.has-session` returns true/false without spawning a
  pty.
- Supervisor tests prove startup reconciliation fails stale pending tabs and
  stale ready tabs, kills only pending sessions, and leaves existing ready tmux
  sessions untouched.
- Experimental runtime page uses the v2 reconnect hook instead of a raw
  one-off WebSocket.
- Unit tests cover v2 terminal URL construction and reconnect classification
  through reusable client helpers or hook-adjacent pure functions.
- Runtime docs document that ready tab reconciliation now runs at startup and
  that stdout replay remains out of scope.
