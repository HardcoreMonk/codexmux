# Runtime V2 Timeline Shadow Handoff

Date: 2026-05-04 KST

## Summary

- Added `src/lib/runtime/timeline-shadow-compare.ts`.
- Added `corepack pnpm smoke:runtime-v2:timeline-shadow`.
- The smoke starts a temp HOME/DB server, writes an allowed Codex JSONL fixture, and compares:
  - legacy `/api/timeline/message-counts`
  - runtime v2 `/api/v2/timeline/message-counts`
  - legacy `/api/timeline/entries`
  - runtime v2 `/api/v2/timeline/entries`
- Mismatch output includes counts, offsets, and entry type sequence only. It does not print prompt, assistant text, or tool arguments.

## Remaining Gate

- Timeline Worker does not yet own live file watchers, subscribers, `timeline:init`, `timeline:append`, `timeline:session-changed`, resume flow, or worker crash reconnect behavior.
- Windows remote JSONL source/sourceId parity still needs fixture and live Windows sync coverage before timeline default cutover.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/timeline-shadow-compare.test.ts`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm smoke:runtime-v2:timeline-shadow`

Smoke output:

```json
{
  "ok": true,
  "counts": {
    "userCount": 1,
    "assistantCount": 1,
    "toolCount": 1,
    "toolBreakdown": {
      "exec_command": 1
    }
  },
  "entryCount": 3,
  "checks": [
    "cookie-login",
    "message-counts-shadow",
    "entries-shadow"
  ]
}
```
