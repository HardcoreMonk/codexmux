# Runtime V2 Timeline Live Shadow Design

## Goal

Move toward runtime v2 Timeline default by adding a live shadow path for timeline init/append/session-changed semantics without changing the client-facing legacy `/api/timeline` WebSocket yet.

## Current Boundary

Legacy `src/lib/timeline-server.ts` currently owns:

- WebSocket auth-upgraded connection handling through custom server.
- Active Codex JSONL detection from tmux pane/process/provider.
- Initial tail snapshot and `timeline:init`.
- File watch, incremental parse, debounce, append fanout, partial append after init offset, and `timeline:append`.
- Session watcher and `timeline:session-changed`.
- Resume command safety and `timeline:resume-*`.
- Last user message and summary side effects into layout/status.

Runtime v2 Timeline Worker currently owns only read commands:

- `timeline.health`
- `timeline.list-sessions`
- `timeline.read-entries-before`
- `timeline.message-counts`

## Design

### Worker Live Watch Service

Add a worker-owned live watch service that can subscribe to one allowed JSONL path and emit sanitized event payloads back through Supervisor.

Worker commands:

- `timeline.live-subscribe`
  - input: `subscriberId`, `jsonlPath`, `sessionName`, `sessionId`, `panelType`
  - output: acknowledgement with `subscriberId` and initial `timeline:init` payload
  - effect: read tail snapshot and start or reuse file watcher
- `timeline.live-unsubscribe`
  - input: `subscriberId`
  - output: acknowledgement
  - effect: remove subscriber and stop watcher when unused

Worker events:

- `timeline.live-append`
  - `subscriberId`, `jsonlPath`, `entries`
- `timeline.live-error`
  - `subscriberId`, `jsonlPath`, `code`, `message`

The worker must not emit cwd, workspace name, tab name, raw prompt body, terminal output, or JSONL path in diagnostics. The command payload may carry `jsonlPath` because the worker must read the file, but perf counters and mismatch output must not print it.

### Legacy Shadow Integration

`src/lib/timeline-server.ts` remains the only client-facing WebSocket in shadow mode. When `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=shadow` and a JSONL path is resolved:

1. Legacy sends the real `timeline:init` and `timeline:append` to clients.
2. Timeline server starts a v2 live subscription for the same JSONL path.
3. A compare helper records count/type/offset/session mismatches between legacy and v2 events.
4. Mismatch details are sanitized and exposed only as counters/debug summaries.
5. If v2 subscription fails, legacy continues unaffected.

This allows Phase 4 to verify worker watcher behavior under live load before any user-visible route switch.

### Default Promotion

Do not enable default in this slice. `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default` remains a follow-up. Default promotion requires:

- Shadow live append smoke passing.
- Android foreground reconnect timeline smoke passing.
- Worker crash/restart behavior documented.
- Rollback to legacy `/api/timeline` verified.

### Resume Handling

Resume command execution stays in legacy for this slice. The worker may observe the new JSONL after legacy resolves and subscribes, but it does not call `sendKeys`, `checkTerminalProcess`, or `buildResumeCommand`.

## Error Handling

- Forbidden JSONL path returns `timeline-jsonl-path-forbidden` and does not create a watcher.
- Watcher failure emits `timeline.live-error` with `retryable=true` until retry budget is exhausted.
- Worker exit in shadow mode increments runtime worker counters but does not close client WebSockets.
- Shadow compare mismatch increments counters and logs sanitized event kind/count/offset only.

## Testing

Unit:

- Worker service subscribe/unsubscribe lifecycle.
- Forbidden path rejection.
- Incremental append event shape.
- Shadow compare helper with count/type/offset/session mismatch.

Smoke:

- `corepack pnpm smoke:runtime-v2:timeline-shadow`
- next-slice `corepack pnpm smoke:runtime-v2:timeline-live-shadow`
  - temp HOME/server
  - create allowed JSONL fixture
  - connect legacy timeline WebSocket
  - append JSONL records
  - verify legacy client receives init/append
  - verify v2 shadow counters report no mismatch

Full:

- `corepack pnpm test`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`

## Rollback

Set `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`. Legacy timeline WebSocket remains the only user-facing path and no worker live subscriptions start.
