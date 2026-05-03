# Runtime v2 Timeline Worker Foundation Design

## Goal

Add a read-only Timeline Worker to runtime v2 so timeline session listing, older-entry reads, and message counts can cross the same typed Supervisor/Worker IPC boundary as Storage and Terminal.

## Scope

- Add `timeline-worker` as a third runtime v2 worker process.
- Add typed IPC commands:
  - `timeline.health`
  - `timeline.list-sessions`
  - `timeline.read-entries-before`
  - `timeline.message-counts`
- Add authenticated runtime v2 HTTP read endpoints under `/api/v2/timeline/*`.
- Keep existing production `/api/timeline` WebSocket and HTTP routes unchanged.
- Keep file watching, live append, session resume, and status integration out of this slice.

## Decisions

- Timeline Worker is read-only in this slice. It may read Codex/remote JSONL files and session index state, but it does not mutate layout/status metadata.
- Path authorization remains duplicated defensively: API handlers reject forbidden JSONL paths before IPC, and Timeline Worker also rejects forbidden paths before filesystem reads.
- Message count cache moves into the worker service for v2. Production `/api/timeline/message-counts` keeps its existing route-local cache.
- Runtime v2 health starts and checks Storage, Terminal, and Timeline. This intentionally proves the third worker is packaged and reachable.
- Existing app surface remains unchanged; the v2 endpoints are foundation/testing surfaces until production cutover.

## Non-Goals

- No production `/api/timeline` replacement.
- No timeline WebSocket workerization.
- No JSONL watcher migration.
- No status worker or notification changes.
- No new UI controls.

## Verification

- Unit tests for IPC schema acceptance/rejection.
- Unit tests for Timeline Worker service command handling.
- Unit tests for runtime v2 timeline API auth/method/validation behavior.
- Runtime v2 focused test suite.
- `tsc`, `lint`, `build`.
