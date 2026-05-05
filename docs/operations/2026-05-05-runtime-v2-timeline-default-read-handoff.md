# Runtime V2 Timeline Default-read Handoff

## Scope

Implemented the Phase 4 HTTP default-read slice. When `CODEXMUX_RUNTIME_V2=1` and
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`, the existing legacy HTTP read URLs stay stable:

- `/api/timeline/sessions`
- `/api/timeline/entries`
- `/api/timeline/message-counts`

Those routes now call Supervisor/Timeline Worker read commands in default mode. The
`/api/timeline` WebSocket remains legacy-owned, including init/append delivery,
`timeline:session-changed`, and resume command execution.

## Verification

- `corepack pnpm vitest run tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/pages/timeline-sessions.test.ts tests/unit/pages/timeline-read-default.test.ts`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm smoke:runtime-v2:timeline-shadow`
- `corepack pnpm build`

## Rollback

Set `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`. The legacy HTTP read routes return to
`listSessionPage`, provider direct older-entry reads, and the legacy message-count cache.
The legacy `/api/timeline` WebSocket is unchanged by this slice.

## Remaining Work

- Timeline Worker ownership for `timeline:session-changed`.
- Resume command execution/process-safety parity before WebSocket default.
- Android foreground timeline reconnect smoke for the default WebSocket path.
- Live default-read perf snapshot on `/api/debug/perf` after deployment.
