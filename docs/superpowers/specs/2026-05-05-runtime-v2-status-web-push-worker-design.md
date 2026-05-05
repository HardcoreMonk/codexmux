# Runtime V2 Status Web Push Worker Design

## Goal

Add Status Worker command ownership for background Web Push sending, while preserving existing foreground visibility suppression and safe payload boundaries.

## Current State

- `StatusManager.sendWebPush()` builds a payload, checks `isAnyDeviceVisible()`, sends through `web-push`, and removes expired subscriptions.
- Device visibility lives in `globalThis` in the main server process and is not shared with worker processes.
- Status Worker can evaluate Web Push intent and session history commands, but cannot send Web Push.

## Scope

- Add Status Worker command:
  - `status.send-web-push`
- Add a worker-side Web Push action adapter with injectable dependencies for tests.
- Keep payload shape compatible with the existing service worker:
  - title
  - body
  - silent
  - tabId
  - workspaceId
  - agentSessionId
  - workspaceName
  - workspaceDir
  - optional needs-input metadata placeholders
- `StatusManager` computes `anyDeviceVisible` in the main process and passes it to the worker command.
- Use worker command only when `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`; `off` and `shadow` keep the legacy send path.

## Non-goals

- Do not change Web Push click routing or deep links.
- Do not include full command, cwd, JSONL path, terminal output, auth cookie, or raw prompt detail in push payloads.
- Do not enable live status default mode in systemd.
- Do not move status WebSocket ownership.

## Verification

- Unit tests for worker Web Push command with injected action adapter.
- Unit tests for IPC schema rejecting extra fields.
- Existing permission smoke remains the needs-input flow gate.
- Focused verification:
  - `corepack pnpm test tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/ipc.test.ts`
  - `corepack pnpm tsc --noEmit`
  - `corepack pnpm lint`

## Rollback

Keep `CODEXMUX_RUNTIME_STATUS_V2_MODE=off` or `shadow`; legacy `StatusManager` sends Web Push directly. In `default`, worker send failure falls back to the legacy send path.
