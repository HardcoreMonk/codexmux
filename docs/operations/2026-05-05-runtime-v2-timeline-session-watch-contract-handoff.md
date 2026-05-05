# Runtime V2 Timeline Session Watch Contract Handoff

## Scope

Added the internal typed contract needed before Timeline Worker can own
`timeline:session-changed` delivery. Timeline Worker now accepts
`timeline.session-watch-subscribe` and `timeline.session-watch-unsubscribe`, reuses provider
`watchSessions()` by pane/session key, emits subscriber-scoped `timeline.session-changed` events,
and stops watchers when the last subscriber is removed. Supervisor exposes matching subscribe and
unsubscribe methods and fans out events only to the matching subscriber.

This slice does not move the client-facing `/api/timeline` WebSocket, resume command execution, or
legacy `timeline:session-changed` delivery.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts`

The focused unit coverage validates IPC payload schemas, event schemas, Worker watcher cleanup, and
Supervisor subscriber fan-out. This slice adds no new smoke command and does not change production
WebSocket output.

## Rollback

No production route ownership changed in this slice. Existing rollback remains
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`, followed by `systemctl --user daemon-reload` and service
restart if the deployed service mode needs to be reverted.

## Remaining Work

- Default-owned `/api/timeline` WebSocket bridge.
- Keep `corepack pnpm smoke:android:timeline-foreground` in the default WebSocket promotion gate.
- Resume command execution ownership after the WebSocket bridge has rollback evidence.
