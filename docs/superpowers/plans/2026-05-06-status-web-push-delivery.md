# Status Web Push Delivery Split

## Goal

Move Web Push delivery fallback orchestration out of `StatusManager` so status
state transitions stay focused on state mutation while delivery policy remains
unit-testable.

## Scope

- Add `src/lib/status/web-push-delivery.ts`.
- Keep existing payload construction in `src/lib/status/web-push-payload.ts`.
- Reuse `createStatusWebPushActions()` for legacy Web Push subscription delivery.
- Preserve runtime v2 default behavior:
  - try `status.send-web-push` through the runtime supervisor first,
  - record sent/failed/removed/skipped counters,
  - fall back to legacy delivery if the runtime request fails.
- Update `StatusManager.sendWebPush()` to provide workspace/config context and
  delegate delivery.

## Verification

- RED: delivery helper unit test fails before the helper exists.
- GREEN: delivery helper unit test passes.
- Regression: focused status tests, `tsc`, lint, full test suite.
