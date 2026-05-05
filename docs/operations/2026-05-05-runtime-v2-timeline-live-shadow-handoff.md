# Runtime V2 Timeline Live Shadow Handoff - 2026-05-05

## Scope

Implemented the first Phase 4 live-shadow code slice. Legacy `/api/timeline` remains the only client-facing WebSocket. When `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow`, the legacy timeline path starts a Timeline Worker live subscription for the resolved JSONL path and compares sanitized init/append metadata against worker output.

## Implemented

- Runtime IPC contracts:
  - `timeline.live-subscribe`
  - `timeline.live-unsubscribe`
  - `timeline.live-append`
  - `timeline.live-error`
- Timeline Worker live watcher/subscriber service with initial init reply and append event emission.
- Supervisor live subscription API and event fan-out.
- `src/lib/runtime/timeline-live-shadow.ts` compare helper with sanitized mismatch counters.
- Legacy timeline server hook that starts/stops live shadow subscriptions without closing or replacing client WebSockets.

## Verification

| Command | Result |
| --- | --- |
| `corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/lib/runtime/timeline-shadow-compare.test.ts tests/unit/lib/runtime/timeline-live-shadow.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts` | Passed: 6 files / 48 tests |
| `corepack pnpm tsc --noEmit` | Passed |
| `corepack pnpm lint` | Passed |
| `corepack pnpm smoke:runtime-v2:timeline-shadow` | Passed: cookie login, message counts shadow, entries shadow |
| `corepack pnpm smoke:runtime-v2:timeline-live-shadow` | Passed: 24 append entries, init match 1, append match 1, mismatch/error counters 0 |
| `corepack pnpm build` | Passed |
| `git diff --check` | Passed |

## Remaining Gates

- Timeline default promotion still needs a dedicated cutover plan and rollback drill.
- Keep resume/session-changed ownership in legacy until explicit Phase 4 follow-up evidence exists.
- Android foreground reconnect timeline smoke remains required before timeline default promotion.
- Runtime v2 Phase 5 status polling/Web Push/session history cutover remains separate.

## Rollback

Set `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`. Shadow subscriptions do not start, and clients remain on legacy `/api/timeline`.
