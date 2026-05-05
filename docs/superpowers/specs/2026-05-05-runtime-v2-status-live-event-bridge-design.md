# Runtime V2 Status Live Event Bridge Design

## Goal

Define the final Runtime v2 Phase 5 ownership step: Status Worker will own live status polling and JSONL watcher state, while the main server bridges worker events to the existing `/api/status` WebSocket clients.

## Current State

- Status Worker can evaluate reducer/policy/client-event decisions.
- Status Worker can execute session history and Web Push commands in default mode.
- Default-mode live bridge is implemented: worker-owned StatusManager runs polling/JSONL watchers and `/api/status` bridges worker events to existing clients.
- `off`/`shadow` still use main-process `StatusManager`.

## Target Ownership

- Status Worker owns:
  - tab status Map
  - process polling loop
  - JSONL watcher lifecycle
  - hook/statusline event application
  - ack/dismiss mutation decisions
  - session history writes
  - Web Push sends
  - rate limit watcher
- Main process owns:
  - `/api/status` WebSocket authentication and socket fan-out
  - forwarding hook/statusline/client messages to Status Worker
  - broadcasting Status Worker events to clients

## Event Contract

Status Worker emits realtime events:

- `status.sync`
  - payload: sanitized client tab map
- `status.update`
  - payload: same shape as existing `IStatusUpdateMessage` without raw JSONL path or tmux session
- `status.session-history-update`
  - payload: `ISessionHistoryEntry`
- `status.hook-event`
  - payload: tab id and `ILastEvent`
- `status.error`
  - payload: code and sanitized message
- `status.rate-limits-update`
  - payload: sanitized rate limit data

Commands:

- `status.live-start`
- `status.live-stop`
- `status.live-request-sync`
- `status.live-hook-event`
- `status.live-client-event`
- `status.live-register-tab`
- `status.live-remove-tab`
- `status.live-notify-last-user-message`
- `status.live-device-visibility`
- `status.live-poll`

## Rollout

1. Add IPC schemas and Supervisor event fan-out.
2. Add worker-owned StatusManager lifecycle in Status Worker.
3. Add main bridge behind `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`.
4. Forward hook/client/register/remove/visibility/notify/poll commands to worker.
5. Run `smoke:runtime-v2:status-default`, `smoke:runtime-v2:status-shadow`, Web Push/session history smoke, Android foreground status reconnect, and browser reconnect before live default flag.

## Non-goals

- Do not change timeline or terminal ownership.
- Do not expose tmux session name, JSONL path, prompt, terminal output, or cwd in worker diagnostics.
- Do not remove legacy `StatusManager` fallback until one release after default mode.

## Verification

- IPC schema tests for all commands/events.
- Supervisor fan-out tests for status realtime events.
- Worker service lifecycle tests.
- Status default smoke with real permission prompt.
- Existing permission smoke and browser reconnect smoke.

## Rollback

Set `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`. Main process uses legacy `StatusManager` polling/broadcast path.
