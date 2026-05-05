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

## Live Transition

2026-05-05 15:54 KST operator-approved transition applied on commit `56041f3`.

- Updated user systemd drop-in: `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`.
- Ran `systemctl --user daemon-reload`.
- Restarted `codexmux.service`.
- `/api/health`: `version=0.4.1`, `commit=56041f3`.
- Authenticated `/api/v2/runtime/health`: `timelineV2Mode=default`, `terminalV2Mode=new-tabs`, `storageV2Mode=default`, `statusV2Mode=off`.
- `systemctl --user show codexmux.service`: `ActiveState=active`, `SubState=running`, `Result=success`, `NRestarts=0`.
- Live default-read route smoke passed for legacy `/api/timeline/sessions`, `/api/timeline/message-counts`, and `/api/timeline/entries` without printing prompt text, assistant text, cwd, JSONL path, terminal output, or tokens.
- `/api/debug/perf`: Timeline Worker `requests=6`, `replies=6`, `commandFailures=0`, `timeouts=0`, `errors=0`, `restarts=0` after smoke.

## Rollback

Set `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`. The legacy HTTP read routes return to
`listSessionPage`, provider direct older-entry reads, and the legacy message-count cache.
The legacy `/api/timeline` WebSocket is unchanged by this slice.

## Remaining Work

- Timeline Worker ownership for `timeline:session-changed`.
- Resume command execution/process-safety parity before WebSocket default.
- Android foreground timeline reconnect evidence is now recorded in `2026-05-05-android-timeline-foreground-handoff.md`; keep that smoke in the default WebSocket promotion gate.
- Live default-read perf snapshot on `/api/debug/perf` after deployment.
