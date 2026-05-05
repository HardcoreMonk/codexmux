# Deploy d3248c4 Handoff

## Scope

Deployed `d3248c4 Add timeline session watcher and Android reconnect smoke` to the local
`codexmux.service`. This deploy includes the Runtime v2 Timeline session watcher IPC foundation,
Android timeline foreground reconnect smoke, and related documentation updates. It does not move
client-facing `/api/timeline` WebSocket ownership.

## Verification

- `node --check scripts/smoke-android-timeline-foreground.mjs`
- `corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`
- `corepack pnpm smoke:android:timeline-foreground`
- `corepack pnpm deploy:local`
- `curl -s http://127.0.0.1:8122/api/health`
- `systemctl --user show codexmux.service --property=ActiveState,SubState,Result,NRestarts,ExecMainPID`

Evidence:

- `/api/health`: `version=0.4.1`, `commit=d3248c4`,
  `buildTime=2026-05-05T07:46:55.160Z`
- systemd: `ActiveState=active`, `SubState=running`, `Result=success`, `NRestarts=0`,
  `ExecMainPID=678084`
- Android timeline foreground smoke: SM-S928N Android 16, `timelineV2Mode=default`,
  `timeline:init totalEntries` initial 3, foreground-1 5, foreground-2 7,
  blocking console/logcat 0

## Rollback

Code rollback remains a normal git/deploy rollback to the previous deployed commit. Runtime v2
timeline read rollback remains `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`, followed by
`systemctl --user daemon-reload` and service restart.

## Remaining Work

- Dedicated default-owned `/api/timeline` WebSocket bridge slice.
- Resume command execution ownership after the WebSocket bridge has rollback evidence.
