# codexmux Runtime Architecture Redesign Design

Date: 2026-05-02
Status: Approved design, pending implementation plan

## Purpose

This design defines the target architecture for a major codexmux runtime redesign.
The redesign optimizes for:

- terminal/input/reconnect/status stability
- maintainable service boundaries
- lower event loop and runtime contention

Provider expansion is a secondary goal. The design should not block future providers,
but the first implementation remains Codex-focused.

## Approved Direction

Use a parallel runtime skeleton first, then deepen the risky paths in order.

The target runtime is:

```text
Browser / PWA / Electron / Android / Windows sync client
  -> Supervisor process
       -> Next.js Pages Router
       -> Auth, access filter, health, API v2
       -> WebSocket upgrade and IPC bridge
       -> Worker lifecycle and readiness
  -> Terminal Worker
       -> tmux lifecycle, node-pty attach, stdin/stdout/resize, kill/restart checks
  -> Storage Worker
       -> SQLite current state, invariants, mutation events, status events
  -> Timeline Worker
       -> JSONL watcher/parser/cache/session index
  -> Status Worker
       -> process polling, reducer, notification, session history
```

The implementation sequence is:

1. Build an experimental supervisor + worker skeleton.
2. Make Terminal Worker production-grade first.
3. Introduce Storage Worker with SQLite as the durable app state.
4. Move Timeline and Status behind worker boundaries after storage is stable.
5. Replace the old runtime on a separate branch once the prototype and platform
   smoke tests pass.

## Non-Goals

- No automatic migration from existing `~/.codexmux/` JSON files is required.
- No Windows `pwsh` pty relay or process lifecycle control is included.
- No App Router migration.
- No terminal transcript persistence beyond the existing tmux/Codex sources.
- No mixed old/new durable state mode for production rollout.

`~/.codex/sessions/**/*.jsonl` remains Codex-owned and read-only.

## Process Boundaries

### Supervisor

The Supervisor remains the single public server entrypoint. It owns:

- Next.js Pages Router integration
- HTTP/API routing
- auth and onboarding gates
- access filtering and health endpoints
- WebSocket upgrade handling
- IPC correlation, timeout, and reply routing
- worker spawn, restart, readiness, and shutdown
- platform shell compatibility for Electron and Android launcher flows

Supervisor must not own domain mutation logic. It validates requests and converts
them into worker commands or queries.

### Terminal Worker

Terminal Worker owns terminal lifecycle and streaming:

- tmux session create, attach, existence check, kill, and restart
- node-pty process management
- stdin, web stdin, resize, heartbeat, and kill messages
- stdout buffering, coalescing, throttling, and backpressure
- terminal connection state and last-output timestamps
- terminal lifecycle events emitted to Supervisor and Storage Worker

Terminal Worker does not persist workspace, layout, or status state directly.
Terminal byte streams are realtime ephemeral data and are not durable events.

### Storage Worker

Storage Worker owns all durable app state:

- SQLite schema and migrations for the new runtime
- workspace, group, pane, tab, status, config, and session metadata mutations
- current-state queries and UI projections
- durable mutation event log
- durable status event log
- invariant enforcement
- backup/export/reset helpers

No runtime worker writes durable workspace/layout/status data directly. Durable
state changes go through Storage Worker commands.

### Timeline Worker

Timeline Worker is introduced after Terminal and Storage are stable. It owns:

- local Codex JSONL watching
- remote Windows JSONL copy watching
- parser/cache/session index
- timeline init/append/load-more fanout
- session list projection from SQLite metadata and read-only JSONL sources

Timeline Worker continues to treat Codex JSONL as read-only.

### Status Worker

Status Worker is introduced after Storage. It owns:

- process polling and Codex process/session detection
- JSONL status metadata reduction
- hook/statusline event handling
- status state-machine application
- notification/session-history policy
- status current-state projection updates through Storage Worker

Status is hybrid: SQLite stores current status and event history, but process and
JSONL sources can reconstruct status after restart or worker crash.

## IPC Contract

The first transport is Node IPC using `child_process.fork`.

Every IPC message uses a typed envelope:

```ts
type TWorkerMessage =
  | IWorkerCommand
  | IWorkerReply
  | IWorkerEvent;

interface IWorkerEnvelope<TPayload> {
  id: string;
  source: string;
  target: string;
  type: string;
  sentAt: string;
  payload: TPayload;
}
```

Commands always receive exactly one reply:

```ts
interface IWorkerCommand<TPayload = unknown> extends IWorkerEnvelope<TPayload> {
  kind: 'command';
}

interface IWorkerReply<TPayload = unknown> extends IWorkerEnvelope<TPayload> {
  kind: 'reply';
  commandId: string;
  ok: boolean;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
}
```

Events are either realtime-only or durable:

```ts
interface IWorkerEvent<TPayload = unknown> extends IWorkerEnvelope<TPayload> {
  kind: 'event';
  delivery: 'realtime' | 'durable';
}
```

Durable events are considered visible only after Storage Worker commits them.
Realtime events can be dropped during disconnects and are recovered through
queries or runtime rescan.

Required command behavior:

- Commands must have schema validation.
- Commands must have timeout handling.
- Worker crash while a command is in flight returns a structured retryable error.
- Supervisor must not emit optimistic durable UI state before Storage commit.
- Idempotent commands must carry caller-supplied keys where repeat delivery is possible.

## Terminal Worker Initial Commands

The prototype should support at least:

```text
terminal.create-session
terminal.attach
terminal.detach
terminal.write-stdin
terminal.write-web-stdin
terminal.resize
terminal.kill-session
terminal.check-process
terminal.get-session-cwd
terminal.get-current-command
terminal.shutdown
```

Initial realtime events:

```text
terminal.stdout
terminal.session-started
terminal.session-ended
terminal.connection-closed
terminal.backpressure
terminal.error
```

`terminal.stdout` is realtime-only. Lifecycle events that affect tab/session
state are durable and must pass through Storage Worker.

## SQLite Storage Model

The new durable app state lives at:

```text
~/.codexmux/codexmux.db
```

Existing JSON files are not the source of truth in the new runtime. The
prototype may back up existing `~/.codexmux/` and start clean.

### Core Tables

Initial schema should include:

```text
workspaces
  id text primary key
  name text not null
  default_cwd text not null
  active integer not null default 0
  group_id text null
  order_index integer not null
  created_at text not null
  updated_at text not null

workspace_groups
  id text primary key
  name text not null
  collapsed integer not null default 0
  order_index integer not null
  created_at text not null
  updated_at text not null

panes
  id text primary key
  workspace_id text not null
  parent_id text null
  node_kind text not null
  split_axis text null
  ratio real null
  position integer not null
  active_tab_id text null
  created_at text not null
  updated_at text not null

tabs
  id text primary key
  workspace_id text not null
  pane_id text not null
  session_name text not null unique
  panel_type text not null
  name text not null default ''
  title text null
  cwd text null
  order_index integer not null
  terminal_ratio real null
  terminal_collapsed integer not null default 0
  web_url text null
  last_command text null
  created_at text not null
  updated_at text not null

tab_status
  tab_id text primary key
  cli_state text not null
  current_process text null
  pane_title text null
  agent_session_id text null
  agent_jsonl_ref text null
  agent_summary text null
  last_user_message text null
  last_assistant_message text null
  current_action_json text null
  ready_for_review_at integer null
  busy_since integer null
  dismissed_at integer null
  last_event_json text null
  event_seq integer not null default 0
  updated_at text not null

agent_sessions
  id text primary key
  provider text not null
  source text not null
  source_id text null
  cwd text null
  jsonl_ref text null
  started_at text null
  last_activity_at text null
  first_message text not null default ''
  turn_count integer not null default 0
  summary text null
  created_at text not null
  updated_at text not null

remote_sources
  id text primary key
  source_label text not null
  host text null
  shell text null
  latest_sync_at text null
  latest_activity_at text null
  latest_cwd text null
  latest_remote_path text null
  total_bytes integer not null default 0
  updated_at text not null
```

Layout is normalized through pane parent/child relationships and tab order. UI
layout JSON is a projection, not storage format.

### Event Tables

```text
mutation_events
  id text primary key
  command_id text null
  actor text not null
  entity_type text not null
  entity_id text not null
  event_type text not null
  payload_json text not null
  before_hash text null
  after_hash text null
  created_at text not null

status_events
  id text primary key
  tab_id text null
  agent_session_id text null
  event_type text not null
  payload_json text not null
  source text not null
  created_at text not null
```

Event logs are for audit, debugging, recovery hints, and dedupe. They are not a
requirement to replay terminal output.

## API And UI Contract

API routes move to a v2 contract that maps to worker commands and queries.
Initial endpoints:

```text
GET  /api/v2/runtime/health
GET  /api/v2/workspaces
POST /api/v2/workspaces
GET  /api/v2/workspaces/:id/layout
POST /api/v2/tabs
PATCH /api/v2/tabs/:id
DELETE /api/v2/tabs/:id
GET  /api/v2/tabs/:id/status
GET  /api/v2/terminal/ws
GET  /api/v2/timeline/sessions
GET  /api/v2/timeline/entries
POST /api/v2/remote/codex/sync
```

The exact route shape can be refined in the implementation plan, but the rule is
fixed: API routes are adapters. They do not mutate filesystem stores or tmux
directly.

UI is redesigned around domain projections from API v2:

- workspace list projection
- layout projection
- tab runtime/status projection
- terminal connection projection
- timeline/session projection

The prototype uses both:

- CLI/API smoke for repeatable verification
- one minimal existing UI path that creates or opens a terminal tab and proves
  real input/output/reconnect behavior

## Platform Acceptance

### Linux Web

Acceptance:

- create workspace
- create terminal tab
- attach terminal through Supervisor and Terminal Worker
- send input and observe output
- resize terminal
- kill/restart terminal session
- restart Supervisor and recover workspace/tab/status projection

### Electron

Acceptance:

- local server mode starts Supervisor and required workers
- app shutdown stops workers cleanly
- remote mode connects to an already-running Supervisor without native changes
- notification settings still read from app state

### Android

Acceptance:

- launcher `/api/health` probe still works
- WebView connects to the Supervisor URL
- foreground reconnect reopens terminal/status/timeline/sync connections
- mobile terminal input including `Ctrl+D` keeps current behavior
- no native bridge changes are required for server-only updates

### Windows

Acceptance:

- Windows companion continues to POST JSONL chunks
- server stores remote JSONL copies and SQLite metadata
- session list can show local and remote sessions
- selecting a Windows session opens read-only timeline
- Windows `pwsh` input/control remains out of scope

## Failure Handling

### Worker Crash

Supervisor treats worker crash as recoverable unless the worker repeatedly fails
readiness. On crash:

1. Mark worker unavailable.
2. Fail in-flight commands with retryable structured errors.
3. Restart the worker.
4. Run readiness checks.
5. Ask Storage Worker for current projections.
6. Ask runtime workers to reconcile external sources.
7. Notify clients to reconnect or refetch.

Terminal stdout is not replayed after worker crash. Clients recover through
terminal reconnect and tmux attach.

### Storage Failure

If Storage Worker cannot commit a durable event:

- the originating command fails
- Supervisor does not broadcast durable state as successful
- runtime side effects that already happened must be reconciled explicitly

For example, if tmux session creation succeeds but Storage commit fails, the
Terminal Worker emits a reconcile-required error and the Supervisor either asks
Storage to retry the tab/session record or asks Terminal Worker to kill the
orphan session.

### Supervisor Restart

Startup order:

1. Initialize config/auth/access filter enough to accept health/onboarding paths.
2. Start Storage Worker.
3. Run storage readiness and schema checks.
4. Start Terminal Worker.
5. Reconcile tmux sessions with SQLite tab/session projection.
6. Start Timeline/Status workers when implemented.
7. Reconcile Codex JSONL, remote sidecars, process state, and status projection.
8. Start public HTTP/WebSocket serving.

## Rollout And Rollback

Implementation happens on a separate branch.

The first implementation target is an experimental entrypoint, not production
replacement. The production replacement happens only after the prototype passes
process-level and platform smoke tests.

Rollback strategy is reset-first:

- back up existing `~/.codexmux/`
- start the new runtime with a fresh SQLite DB
- restore the backup if the branch is abandoned

The rollout does not maintain long-running compatibility between old JSON
stores and new SQLite state.

## Verification Gates

Required before replacing the old runtime:

- IPC schema and timeout tests
- Storage Worker schema and invariant tests
- Terminal Worker process tests with real tmux/node-pty
- CLI/API smoke for workspace/tab/session lifecycle
- minimal UI terminal smoke
- Supervisor restart recovery test
- Terminal Worker crash/restart test
- Storage commit failure test
- Android foreground reconnect smoke
- Electron local and remote mode smoke
- Windows JSONL sync/read-only timeline smoke
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`

## Documentation Impact

The implementation will require updates to:

- `docs/ADR.md`
- `docs/ARCHITECTURE-LOGIC.md`
- `docs/TMUX.md`
- `docs/STATUS.md`
- `docs/DATA-DIR.md`
- `docs/PERFORMANCE.md`
- `docs/ELECTRON.md`
- `docs/ANDROID.md`
- `docs/WINDOWS.md`
- `docs/SYSTEMD.md`

## ADR Draft

The following durable decisions should become ADR entries or revisions when the
implementation starts.

### ADR Draft: Supervisor And Worker Runtime

- Status: Proposed
- Decision: Keep the custom Node server and Pages Router, but redefine the
  server as a Supervisor that owns public routing, auth, worker lifecycle, and
  IPC bridging. Move terminal, storage, timeline, and status runtime
  responsibilities behind worker process boundaries.
- Rationale: terminal IO, JSONL parsing, process polling, and storage mutation
  should not all compete in one event loop or one module graph. Worker
  boundaries make failures restartable and ownership explicit.
- Consequences: API routes call Supervisor services instead of direct store/tmux
  helpers. Worker health, restart, timeout, and reconciliation become core
  runtime concepts.

### ADR Draft: SQLite App State

- Status: Proposed
- Decision: Replace JSON-file app state for workspace/layout/tab/status metadata
  with `~/.codexmux/codexmux.db`, owned by Storage Worker.
- Rationale: normalized entities, transactions, invariant enforcement, indexed
  queries, and event logs are difficult to maintain safely across many JSON
  files and direct module callers.
- Consequences: legacy JSON compatibility is not required for the first
  redesign. Backup/reset is the rollback strategy. Codex-owned JSONL remains
  read-only and separate.

### ADR Draft: Typed IPC

- Status: Proposed
- Decision: Use `child_process.fork` and typed envelope messages for first
  worker transport.
- Rationale: Node IPC is the simplest process boundary that preserves TypeScript
  reuse and avoids internal ports while proving the worker architecture.
- Consequences: all commands need schema validation, correlation ids, timeouts,
  structured errors, and process-level tests.

### ADR Draft: Terminal Streams Are Ephemeral

- Status: Proposed
- Decision: terminal stdin/stdout/resize streams are realtime ephemeral data.
  Terminal lifecycle and status facts can be durable, but terminal byte streams
  are not persisted in SQLite.
- Rationale: tmux is already the terminal runtime source. Persisting terminal
  bytes would add large storage cost and replay complexity without solving the
  primary stability issue.
- Consequences: terminal output is not replayed after worker crash. Clients
  recover by reconnecting to tmux through Terminal Worker.

## Deferred Implementation Decisions

These decisions are intentionally deferred to the implementation plan and must
be resolved before implementation starts:

- exact package/module layout for worker code
- whether IPC schemas use zod or a smaller internal validator
- whether SQLite access uses a synchronous native binding or an async wrapper
- exact API v2 URL shape
- exact experimental entrypoint name
- exact backup directory naming

None of these change the approved architecture.
