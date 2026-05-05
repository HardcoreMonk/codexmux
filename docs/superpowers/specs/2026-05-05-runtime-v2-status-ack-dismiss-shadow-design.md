# Runtime V2 Status Ack/Dismiss Shadow Design

## Goal

Advance Runtime v2 Phase 5 by moving needs-input ack and ready-for-review dismiss decision logic behind Status Worker shadow evaluation, while keeping legacy `StatusManager` as the production executor.

## Current State

- `StatusManager.dismissTab()` accepts only `ready-for-review` tabs, moves them to `idle`, persists `dismissedAt`, broadcasts an update, and updates session history dismissal time.
- `StatusManager.ackNotificationInput()` accepts only matching `needs-input` notification events, moves the tab back to `busy`, persists layout status, and broadcasts an update.
- Runtime v2 Status Worker can shadow reducer, notification policy, and side-effect intent, but it does not yet evaluate client event acceptance.

## Scope

- Add a pure client event policy for:
  - `dismiss-tab`
  - `ack-notification`
- Add Status Worker command:
  - `status.evaluate-client-event`
- Shadow compare legacy and worker output in `StatusManager.dismissTab()` and `StatusManager.ackNotificationInput()` when `CODEXMUX_RUNTIME_STATUS_V2_MODE=shadow`.
- Record sanitized counters only:
  - `runtime_v2.status_shadow.client_event.match`
  - `runtime_v2.status_shadow.client_event.mismatch`
  - `runtime_v2.status_shadow.client_event.error`
- Extend `corepack pnpm smoke:runtime-v2:status-shadow`.

## Non-goals

- Do not move `/api/status` WebSocket ownership.
- Do not make Status Worker mutate tab state, layout, or session history.
- Do not persist ack/dismiss audit history in this slice.
- Do not include tab id, workspace name, prompt, cwd, JSONL path, terminal output, or raw option labels in worker payloads or diagnostics.

## Data Flow

1. A client sends `status:tab-dismissed` or `status:ack-notification`.
2. `StatusManager` builds a sanitized event input from current state and notification sequence metadata.
3. Legacy policy decides whether the event is accepted.
4. In shadow mode, Status Worker returns the same boolean/string intent.
5. `StatusManager` records match/mismatch/error counters and continues legacy execution.

## Verification

- Unit tests for pure client event policy.
- Unit tests for Status Worker `status.evaluate-client-event`.
- Supervisor proxy coverage.
- Status shadow smoke includes dismiss and ack client event checks.
- Focused verification:
  - `corepack pnpm test tests/unit/lib/status-client-event-policy.test.ts tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/ipc.test.ts`
  - `corepack pnpm smoke:runtime-v2:status-shadow`
  - `corepack pnpm tsc --noEmit`
  - `corepack pnpm lint`

## Rollback

Set `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`. Legacy `StatusManager` remains production owner in all modes for this slice.
