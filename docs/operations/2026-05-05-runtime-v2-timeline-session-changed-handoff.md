# Runtime V2 Timeline Session-changed Handoff

## Scope

Added WebSocket default-promotion evidence for session watcher ordering. This slice does not move
`/api/timeline` WebSocket ownership. It verifies the current legacy session watcher behavior while
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default` is active for HTTP reads.

## Verification

- `corepack pnpm smoke:runtime-v2:timeline-session-changed`

The smoke starts a temp server/HOME, opens `/api/timeline` while a Codex process is running before
its JSONL exists, creates the JSONL after the WebSocket is open, and verifies that
`timeline:session-changed` with `reason="new-session-started"` arrives before the new JSONL
`timeline:init`.

Smoke output is sanitized and does not include prompt text, assistant text, cwd, JSONL path,
terminal output, or tokens.

## Rollback

No production WebSocket ownership changed in this slice. Existing rollback remains
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`, followed by `systemctl --user daemon-reload` and
service restart.

## Remaining Work

- Default-owned `/api/timeline` WebSocket delivery.
- Keep `corepack pnpm smoke:android:timeline-foreground` in the default WebSocket promotion gate.
