# CODEX Panel Timeline Hotfix Handoff

Date: 2026-05-07 KST

## Scope

This handoff records the CODEX panel hang regression fixed after `v0.4.7`.
The user-visible symptom was that selecting CODEX from the TERMINAL/CODEX/DIFF menu showed a
loading skeleton instead of timeline messages.

## Root Cause

- First failure mode: panel type switching treated CODEX as a visual surface but dropped
  client-local Codex metadata in some paths. A tab with stored timeline metadata could return to
  CODEX with no active `agentSessionId`/`agentJsonlPath` in the client state.
- Second failure mode: Runtime v2 `/api/timeline` sent `timeline:init`, then a duplicate
  `timeline:session-changed` with `reason="new-session-started"` for the same session and JSONL
  path. The client correctly cleared entries on session change, but no second init followed, so the
  panel looked stuck.

## Implemented

- `9433f1b fix: preserve codex panel timeline state`
  - Preserve `agentSessionId` and `agentJsonlPath` during TERMINAL/CODEX/DIFF panel changes.
  - Restore `sessionView=timeline` when layout metadata already points at a Codex session.
- `923e9d6 fix: suppress duplicate timeline session changes`
  - Runtime timeline WebSocket suppresses duplicate same-JSONL `new-session-started` events after
    init.
  - The legitimate delayed-JSONL path still sends `session-changed` before the new init.

## Verification

| Check | Result |
| --- | --- |
| Playwright diagnostic before fix | reproduced: fresh CODEX had timeline log, `TERMINAL -> CODEX` left skeleton; WS frames showed `timeline:init` followed by duplicate `new-session-started` |
| `corepack pnpm vitest run tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/hooks/use-layout-panel-type.test.ts tests/unit/hooks/use-tab-store.test.ts tests/unit/lib/session-list-rendering.test.ts` | passed, 21 tests |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm smoke:runtime-v2:timeline-websocket-default` | passed |
| `corepack pnpm smoke:runtime-v2:timeline-session-changed` | passed after clearing the stale local port conflict |
| `corepack pnpm lint` | passed |
| `corepack pnpm build` | passed |
| `corepack pnpm deploy:local` | passed |

## Production State

| Field | Value |
| --- | --- |
| Version | `0.4.7` |
| Health commit | `923e9d6` |
| Build time | `2026-05-06T18:37:23.469Z` |
| Service | `codexmux.service` `ActiveState=active`, `SubState=running`, `NRestarts=0` |
| Runtime timeline mode | default-owned `/api/timeline` bridge remains enabled |

## Operator Notes

- Existing browser tabs, Android WebView, or PWA windows may still hold the old JavaScript bundle
  immediately after deploy. Reload the page or restart the app before treating a repeated CODEX
  skeleton as a server-side failure.
- If the symptom reappears after reload, collect `/api/health`, the timeline WebSocket frame order,
  and the two runtime timeline smoke results before changing rollback flags.
- Rollback flag remains `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`; deleting runtime SQLite data is not
  part of this recovery path.
