# Runtime V2 Status Side-effect Shadow Design

## Goal

Move Runtime v2 Phase 5 forward by letting the Status Worker evaluate status side-effect intent in shadow mode, while the existing `StatusManager` remains the production owner for polling, JSONL watch, WebSocket broadcast, ack/dismiss, Web Push, and session history writes.

## Current State

- `StatusManager` owns live status polling, tab state, JSONL watchers, status WebSocket clients, Web Push, and session history.
- Status Worker owns policy-only commands:
  - `status.health`
  - `status.reduce-hook-state`
  - `status.reduce-codex-state`
  - `status.evaluate-notification-policy`
- `CODEXMUX_RUNTIME_STATUS_V2_MODE=off` is live. `shadow` and `default` parse as valid modes, but only policy shadow smoke currently exists.

## Scope

- Add a pure side-effect policy that turns a state transition into sanitized intent flags:
  - clear dismissed timestamp
  - set ready timestamp
  - set busy timestamp
  - save session history
  - send review Web Push
  - send needs-input Web Push
  - start JSONL watch
  - stop JSONL watch
- Add a Status Worker command:
  - `status.evaluate-side-effects`
- In `StatusManager.applyCliState()`, keep existing side effects as production behavior, but structure the legacy intent with the same input shape.
- When `CODEXMUX_RUNTIME_V2=1` and `CODEXMUX_RUNTIME_STATUS_V2_MODE=shadow`, ask the Status Worker for side-effect intent and compare sanitized flags.
- Record only counters:
  - `runtime_v2.status_shadow.side_effect.match`
  - `runtime_v2.status_shadow.side_effect.mismatch`
  - `runtime_v2.status_shadow.side_effect.error`
- Update status shadow smoke to cover side-effect evaluation.

## Non-goals

- Do not move `/api/status` WebSocket ownership.
- Do not move polling, JSONL watchers, ack/dismiss handlers, Web Push sends, or session history writes to the Status Worker.
- Do not store raw prompt body, command body, cwd, JSONL path, terminal output, or Web Push payload in runtime diagnostics.
- Do not set `CODEXMUX_RUNTIME_STATUS_V2_MODE=default`.

## Data Flow

1. A legacy status transition occurs in `StatusManager.applyCliState()`.
2. The manager computes the same production side-effect decisions it already applied, represented as booleans.
3. In shadow mode only, the manager calls `supervisor.evaluateStatusSideEffects(input)`.
4. The Status Worker returns the same boolean intent shape.
5. The manager compares booleans and records match/mismatch/error counters without blocking the production transition.

## Error Handling

- Shadow errors are best-effort and never block status updates.
- Worker unavailability increments `runtime_v2.status_shadow.side_effect.error`.
- Mismatches log only field names and boolean/string/null values.
- `default` remains unsupported for live status ownership in this slice.

## Verification

- Unit tests for pure side-effect policy.
- Unit tests for Status Worker `status.evaluate-side-effects`.
- Supervisor proxy coverage.
- Existing status shadow smoke extended to compare side-effect intent.
- Focused verification:
  - `corepack pnpm test tests/unit/lib/status-side-effect-policy.test.ts tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/status-shadow-compare.test.ts`
  - `corepack pnpm smoke:runtime-v2:status-shadow`
  - `corepack pnpm tsc --noEmit`
  - `corepack pnpm lint`

## Rollback

Set `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`. Production `StatusManager` behavior remains the same because this slice only adds shadow evaluation and counters.
