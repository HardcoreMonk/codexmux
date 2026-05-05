# Runtime V2 Timeline WebSocket Cutover Handoff

## Scope

`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default` now routes the existing client-facing
`/api/timeline` WebSocket through the Runtime v2 timeline bridge. The URL, cookie auth,
panel type query, and client message shape stay stable. Init, append, error, and
`timeline:session-changed` delivery are backed by Timeline Worker live/session-watch IPC through
Supervisor.

Resume messages still reuse the existing server-side unsafe-process guard and `sendKeys` helper,
but v2 mode no longer attaches the legacy file watcher during resume. The runtime bridge switches
the Worker live subscription directly when resume resolves a JSONL path.

## Implementation Notes

- `src/lib/runtime/timeline-ws.ts` owns Runtime v2 WebSocket connection state, heartbeat, live
  subscription cleanup, session-watch cleanup, manual subscribe/unsubscribe, resume handoff, and
  perf counters.
- `src/lib/timeline-server.ts` keeps the public `/api/timeline` upgrade boundary and mode switch.
  `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off` remains the rollback path to the legacy WebSocket
  implementation.
- Session watcher subscription is established before sending an unresolved initial empty init.
  This avoids missing a JSONL that appears immediately after the client receives the empty init.
- The session-changed and Android foreground smoke fixtures keep a shell as the tmux pane process
  and run the fake Codex process as a child. This matches the existing Codex process detection
  utility, which scans the pane process tree.

## Verification

Fresh verification run in the worktree:

- `corepack pnpm test tests/unit/lib/runtime/timeline-ws.test.ts`
- `corepack pnpm smoke:runtime-v2:timeline-websocket-default`
- `corepack pnpm smoke:runtime-v2:timeline-live-shadow`
- `corepack pnpm smoke:runtime-v2:timeline-resume-safety`
- `corepack pnpm smoke:runtime-v2:timeline-session-changed`
- `corepack pnpm smoke:android:timeline-foreground`

Android evidence:

- Device: `R3CX10RTWFH`, SM-S928N, Android 16.
- App: `com.hardcoremonk.codexmux`, `versionName=0.4.1`, `versionCode=401`.
- Result: `timelineV2Mode=default`, initial/foreground-1/foreground-2 `timeline:init`
  `totalEntries=3/5/7`, blocking console 0, blocking logcat 0, restore URL ready.

## Rollback

Set:

```bash
CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off
```

Then reload/restart the user service if this is applied through the systemd drop-in:

```bash
systemctl --user daemon-reload
systemctl --user restart codexmux.service
```

Expected rollback behavior: `/api/timeline` remains the same public URL, but `timeline-server.ts`
uses the legacy WebSocket file/session watcher path. Runtime Worker state and SQLite data do not
need to be deleted.

## Follow-up

- Preserve Android/Electron/browser reconnect smoke JSON as release workflow artifacts.
- Continue measurement-based perf tuning from `/api/debug/perf`, especially timeline read/init,
  append, status polling, diff, and stats timings.
- Status Phase 5 remains separate: polling, ack/dismiss, Web Push, and session history ownership
  are not moved by this timeline WebSocket cutover.
