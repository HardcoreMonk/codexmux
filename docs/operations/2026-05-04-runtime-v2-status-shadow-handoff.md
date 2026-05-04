# Runtime V2 Status Shadow Handoff

Date: 2026-05-04 KST

## Summary

- Added `src/lib/runtime/status-shadow-compare.ts`.
- Added `corepack pnpm smoke:runtime-v2:status-shadow`.
- The smoke starts real runtime v2 workers through the Supervisor and compares Status Worker IPC results against legacy pure helpers for:
  - hook state reducer
  - Codex state reducer
  - notification policy

## Remaining Gate

- Status Worker still does not own process polling, JSONL watch, hook event side-effect application, dismiss/ack, Web Push, or session history writes.
- Default status cutover remains blocked until those side effects have typed events, smoke coverage, and rollback proof.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/status-shadow-compare.test.ts`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm smoke:runtime-v2:status-shadow`

Smoke output:

```json
{
  "ok": true,
  "checks": [
    "workers-started",
    "hook-state-shadow",
    "codex-state-shadow",
    "notification-policy-shadow"
  ]
}
```
