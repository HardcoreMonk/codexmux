# Runtime V2 Timeline Resume Safety Handoff

## Scope

Added a WebSocket default-promotion evidence smoke. The smoke does not move
`/api/timeline` WebSocket ownership. It verifies that with
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`, the legacy timeline resume path still blocks
unsafe active foreground processes before resume command execution.

## Verification

- `corepack pnpm smoke:runtime-v2:timeline-resume-safety`

The smoke starts a temp server/HOME, opens `/api/timeline` for a tmux pane whose foreground
process is not a shell, sends `timeline:resume`, and expects `timeline:resume-blocked` with
`reason="process-running"`.

Smoke output is sanitized and does not include prompt text, assistant text, cwd, JSONL path,
terminal output, or tokens.

## Rollback

No production route ownership changed in this slice. Existing rollback remains
`CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`, followed by `systemctl --user daemon-reload` and
service restart.

## Remaining Work

- Default-owned `/api/timeline` WebSocket delivery.
- Keep `corepack pnpm smoke:android:timeline-foreground` in the default WebSocket promotion gate.
