# codexmux Runtime Architecture Redesign Design

Date: 2026-05-02
Status: Approved design, plan-grilled for first implementation slice

## Purpose

This design defines the target architecture for a major codexmux runtime redesign.
The redesign optimizes for:

- terminal/input/reconnect/status stability
- maintainable service boundaries
- lower event loop and runtime contention

Provider expansion is a secondary goal. The design should not block future providers,
but the first implementation remains Codex-focused.

## Approved Direction

Use a parallel runtime slice first, then deepen the risky paths in order. The
first slice must prove worker-owned storage and the minimum worker-owned terminal
byte path. A slice that only creates tmux sessions and reads layout JSON is not
enough.

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

1. Build an experimental Supervisor + Storage Worker + Terminal Worker slice
   with v2 terminal attach/input/output smoke.
2. Make Terminal Worker production-grade after the byte path is proven.
3. Expand Storage Worker command coverage with SQLite as the durable app state.
4. Move Timeline and Status behind worker boundaries after storage is stable.
5. Replace the old runtime on a separate branch once the prototype and platform
   smoke tests pass.

## First Slice Decisions

The first implementation slice is intentionally experimental, but the following
decisions are fixed:

- The runtime is enabled only with `CODEXMUX_RUNTIME_V2=1`.
- Existing production routes remain default. Runtime v2 does not replace current
  `/api/terminal`, `/api/timeline`, `/api/status`, or JSON stores.
- `/api/v2/terminal?session=...` is the experimental Terminal Worker-owned
  WebSocket path. It must attach through Terminal Worker and must not reuse the
  old terminal WebSocket handler.
- Terminal Worker crash recovery for the first slice is close-and-reattach only.
  Attached v2 terminal WebSockets close with code `1011` and reason
  `Terminal worker exited`; clients reconnect by opening a fresh
  `/api/v2/terminal` connection after WorkerClient restart/readiness succeeds.
  Automatic resubscribe and stdout replay are out of scope.
- Terminal stdout is realtime IPC, but the first slice must still include
  bounded per-session stdout coalescing/backpressure so a noisy process cannot
  grow Worker-to-Supervisor IPC or memory without limit.
- Stdout frame splitting must be Unicode-safe: frame byte caps are enforced
  without splitting JavaScript surrogate pairs or replacing Korean/emoji
  characters at frame boundaries.
- Stdout buffering uses explicit byte accounting. Terminal Worker tracks
  buffered `{ chunks, bytes, timer }`, updates `bytes` with
  `Buffer.byteLength(data, 'utf8')`, flushes by joining chunks once before
  Unicode-safe splitting, and only flushes from the normal timer-driven attached
  flow. Detach, kill, and backpressure clear buffered partial output without
  emitting it.
- Terminal Worker tracks attached sessions separately from stdout buffers.
  `onData` appends only while the session is still attached, and detach, kill,
  or backpressure remove the session before clearing buffers so late pty output
  cannot recreate stale stdout.
- Supervisor owns fanout for multiple WebSocket subscribers on the same terminal
  session. It sends `terminal.attach` only when the first subscriber joins a
  session and sends `terminal.detach` only when the last subscriber leaves; extra
  subscribers do not create duplicate Terminal Worker pty attaches. Supervisor
  tracks one in-flight attach attempt per session. Subscribers that arrive while
  the first attach is still pending wait for the same attach result instead of
  returning as if the session were already attached. If that attach fails after
  Supervisor sends `terminal.attach`, Supervisor removes every subscriber that
  joined that attach attempt and sends best-effort `terminal.detach`; detach
  failure is hidden and the original attach failure is preserved for all waiting
  callers.
- Terminal Worker uses a separate tmux socket, `codexmux-runtime-v2`, and
  session names prefixed with `rtv2-`. Production tmux reset/scan/status code
  must not observe or kill v2 sessions.
- v2 tmux session names are Supervisor-generated only and must pass a strict
  tmux-target-safe schema: `rtv2-` prefix, lowercase alphanumeric/dash
  characters only, and a bounded maximum length. HTTP and WebSocket callers do
  not get to create arbitrary session names.
- v2 terminal attach is authorized by durable Storage state. A safe-looking
  `rtv2-` string is not enough; Supervisor must verify the session belongs to a
  finalized `ready` terminal tab before Terminal Worker receives attach
  commands. Terminal Worker then verifies the tmux session still exists with
  `tmux has-session` before spawning the attach pty. Missing tmux sessions fail
  with non-retryable `runtime-v2-terminal-session-not-found`; the first slice
  does not mutate the ready tab to failed during attach because that needs a
  durable terminal lifecycle design. User-initiated WebSocket kill is
  unsupported in the first slice; Terminal Worker kill is reserved for
  Supervisor-owned cleanup paths until a durable `closing`/`closed` tab
  lifecycle is designed.
- After v2 terminal attach, stdin and resize commands must be authorized by the
  active WebSocket subscriber, not just by `sessionName`. The WebSocket handler
  passes the `subscriberId` returned from `attachTerminal()` to
  `writeTerminal()` and `resizeTerminal()`. Supervisor rejects missing or
  detached subscribers with non-retryable
  `runtime-v2-terminal-subscriber-not-found` before Terminal Worker receives
  stdin or resize.
- The v2 terminal WebSocket handler serializes messages per socket. Stdin,
  web-stdin, resize, and kill frames are handled in receive order. If one queued
  command fails, the handler closes the socket with `1011`, detaches the
  subscriber, and treats later queued frames as no-ops. The handler registers
  close/error and message handling before awaiting `attachTerminal()`. Frames
  received while attach is pending count toward input backpressure and wait for
  the attach promise; they run only after a `subscriberId` exists. If attach
  fails or the socket closes while attach is pending, queued frames become
  no-ops. If the socket closes while attach is pending and attach later succeeds,
  the handler immediately detaches the returned subscriber once and returns
  without processing messages.
  The first slice does not cancel an already-sent `terminal.attach` IPC command;
  attach cleanup happens after attach resolves. If every subscriber waiting on an
  in-flight attach closes before attach resolves, the successful attach is
  followed by normal subscriber detach cleanup, with only the final detach
  sending `terminal.detach` to Terminal Worker.
- The v2 terminal WebSocket handler also applies input queue backpressure per
  socket. A socket may queue at most 256 frames or 1 MiB of raw payload. If
  either limit is exceeded, the handler closes the socket with
  `1011 Terminal input backpressure`, detaches the subscriber, and does not pass
  overflow frames to Supervisor or Terminal Worker.
- V2 terminal dimensions are normalized consistently. Attach query dimensions
  default to `80x24` when missing or invalid. Valid attach query values must be
  unsigned decimal positive integer strings without signs, decimal points, radix
  prefixes, exponents, decoded whitespace, or leading zeroes, and valid values
  clamp to `cols 1..500` and `rows 1..200`. Duplicated `cols` or `rows` query
  parameters are invalid for that dimension and fall back independently. Resize frames use the same upper
  bounds; zero and short resize payloads are ignored. For multiple subscribers on one
  shared pty, only the attach dimensions from the attach attempt that creates
  the Terminal Worker pty are used as the initial pty size. Later subscriber
  attach query dimensions do not auto-resize the pty; explicit resize frames
  remain authorized by `subscriberId`, and the last accepted resize wins for the
  shared pty.
- The first slice must include a process-level Terminal Worker runtime test that
  uses real tmux and real `node-pty` for create, attach, stdin, stdout, resize,
  and kill. Fake runtime service tests and full server smoke are not sufficient
  by themselves.
- Linux CI must install `tmux` and resolve `node-pty`; missing Linux
  prerequisites are hard verification failures, not skip conditions. Only
  non-Linux runners may skip the process-level Terminal Worker runtime test.
- Runtime v2 HTTP and terminal WebSocket auth use the existing authenticated app
  surface, with client-specific constraints: browser, Electron, and Android
  WebView clients use the session cookie; Node smoke uses the `x-cmux-token`
  header. `x-cmux-token` query parameters and other query-string credentials are
  forbidden on both HTTP v2 APIs and `/api/v2/terminal`. Query credential names
  are rejected through a case-insensitive denylist: `token`, `x-cmux-token`,
  `authorization`, `auth`, `api_key`, `apikey`, `access_token`, and
  `session-token`. `/api/v2/terminal?session=...` remains allowed because it is
  the terminal session identifier, not an auth credential. Malformed request URLs
  fail closed as authentication failures instead of throwing into a 500.
- The `/api/v2/terminal` WebSocket upgrade uses the same disabled-first feature
  gate as HTTP v2 APIs. If `CODEXMUX_RUNTIME_V2 !== "1"`, the server returns
  `404 runtime-v2-disabled` before runtime v2 WebSocket auth, generic WebSocket
  auth, session parsing, or `handleUpgrade()`. Disabled, unauthorized, and
  invalid-session upgrade failures use one JSON response helper with
  `Content-Type: application/json`, exact `Content-Length`, and
  `Connection: close`. The raw response uses `\r\n\r\n` between headers and JSON
  body. The helper closes with `socket.end(response)` and only falls back to
  best-effort `safeDestroySocket()` if `end()` throws; destroy failures are
  swallowed so the helper does not reject. `safeDestroySocket()` is an internal
  implementation detail; tests cover it only through public upgrade-router and
  factory behavior. The single-query-param helper is private too; tests cover
  missing/empty/duplicated query outcomes through public upgrade-router behavior
  rather than helper-level duplicate-vs-missing reasons. The exported function
  option types are public too, so tests and `server.ts` wiring can type injected
  fixtures without exporting internal cleanup helpers. The v2 terminal upgrade
  policy lives in the exported `routeWebSocketUpgrade()` helper; dev and prod
  upgrade handlers are created by `createWebSocketUpgradeHandler()` so
  remote-address rejection and fallback wiring can be unit-tested without
  importing `server.ts`. The factory wraps the whole returned listener in a
  top-level `try/catch`, including remote-address checks and `rejectSocket()`.
  Unexpected exceptions call injected error logging inside its own best-effort
  `try/catch`, then fail-close with `safeDestroySocket()`; logging or destroy
  failures must not reject the upgrade listener promise. It does not attempt to
  write JSON from that top-level catch because upgrade processing may already
  have partially started.
  Missing, empty, non-origin-form, raw non-ASCII/control/space/hash-containing,
  malformed percent-encoding, encoded path delimiters, or malformed WebSocket
  request URLs return `400 invalid-websocket-url` before runtime/generic auth,
  `handleUpgrade()`, or fallback proxying. Runtime v2 WebSocket namespace paths,
  including the bare `/api/v2` path, other than
  `/api/v2/terminal` return `404 runtime-v2-upgrade-not-found` before
  runtime/generic auth, known upgrade handling, or fallback proxying.
  `routeWebSocketUpgrade()` lives in
  `src/lib/runtime/server-ws-upgrade.ts`, is the only upgrade path that parses
  `request.url`, owns v2 terminal query dimension parsing, passes the parsed
  legacy `URL` to injected known-route callbacks, and passes parsed v2 terminal
  context to the injected v2 terminal callback. It stays independent from
  `terminal-ws.ts` so upgrade-router tests do not load the WebSocket connection
  handler. Runtime or generic WebSocket auth verifier exceptions fail closed as
  `401 Unauthorized` through the same JSON helper: successful responses close
  with `socket.end(response)`, and `safeDestroySocket()` is only the fallback when
  `end()` throws.
  `server.ts` imports runtime modules via `./src/...` paths; `@/` aliases remain
  for files under `src/`.
- HTTP v2 API routes remain adapters. They validate requests and call
  Supervisor services. They do not mutate filesystem stores or tmux directly.
  The `CODEXMUX_RUNTIME_V2` disabled gate runs before auth, method validation,
  request parsing, or Supervisor access, so disabled runtime v2 endpoints return
  `404 runtime-v2-disabled` without exposing auth behavior.
- Runtime v2 API error mapping is explicit: validation errors return `400`;
  `runtime-v2-pane-not-found`, `runtime-v2-pending-tab-not-found`,
  `runtime-v2-terminal-session-not-found`, and
  `runtime-v2-terminal-subscriber-not-found` return `404`;
  `runtime-v2-pane-workspace-mismatch` returns `409`; retryable worker failures
  return `503`; runtime startup/configuration errors such as
  `runtime-v2-sqlite-unavailable`, `runtime-v2-worker-script-missing`,
  `runtime-v2-tmux-config-missing`, `runtime-v2-tmux-config-source-failed`, and
  `runtime-v2-schema-too-new` return `500`.
- The custom server and Next API routes must share one runtime Supervisor through
  `globalThis.__ptRuntimeSupervisor`. Startup uses a shared in-flight
  `startPromise`; `server.ts` may eager-start when runtime v2 is enabled, and
  API routes must only retrieve the singleton and await `ensureStarted()`.
- `ensureStarted()` is readiness-gated. It succeeds only after both first-slice
  workers pass readiness and startup reconciliation completes; partial startup
  failures shut down workers and retry cleanly on the next call.
- `better-sqlite3` is the first SQLite binding. It is an optional native
  dependency loaded lazily by Storage Worker only when runtime v2 is enabled.
  Missing SQLite binding must surface as `runtime-v2-sqlite-unavailable` and
  must not break runtime v2 off installs or builds.
- Electron/native module packaging is part of verification for this slice:
  `node-pty` and optional `better-sqlite3` must resolve from the
  `.next/standalone/node_modules` layout used by Electron local server mode, and
  runtime v2 on must fail verification if the SQLite binding is missing or
  unresolved.
- Runtime worker script and tmux config packaging are part of verification for
  this slice. Worker scripts must exist in dev, web/npm standalone, and packaged
  Electron `app.asar.unpacked` layouts; `resolveRuntimeWorkerScript()` fails with
  non-retryable `runtime-v2-worker-script-missing` if the resolved script is
  absent. `src/config/tmux.conf` must also exist in those layouts. Terminal
  Worker resolves it only through `resolveRuntimeTmuxConfigPath()` and fails with
  `runtime-v2-tmux-config-missing` if it is absent. If the file exists but
  `tmux source-file` rejects it, Terminal Worker fails with non-retryable
  `runtime-v2-tmux-config-source-failed`. If `tmux new-session` succeeds before
  that post-create failure, Terminal Worker best-effort kills the just-created
  session before returning the original error; Supervisor still keeps its
  rollback kill as a fallback.
- `CODEXMUX_RUNTIME_V2=1` reuses an existing
  `~/.codexmux/runtime-v2/state.db` and applies migrations.
- The first schema version is `CURRENT_RUNTIME_SCHEMA_VERSION = 1`. Storage
  initialization must run a real migration runner, record v1 in
  `schema_migrations`, treat repeated opens as idempotent, and fail with
  `runtime-v2-schema-too-new` if the DB contains a newer version.
- `CODEXMUX_RUNTIME_V2_RESET=1` moves any existing runtime SQLite DB file or
  WAL/SHM sidecar to timestamped backups before creating a fresh DB. The reset
  check is true when any of `state.db`, `state.db-wal`, or `state.db-shm`
  exists; it does not depend on the main DB file existing.
  `CODEXMUX_RUNTIME_V2=1` alone must never delete a DB or sidecar.
- `GET /api/v2/workspaces` is included in the first slice so reload and restart
  smoke can inspect persisted v2 state.
- `DELETE /api/v2/workspaces/:id` is included only for authenticated v2 smoke
  cleanup. Storage deletes the workspace and returns the deleted workspace's v2
  terminal sessions from inside the same transaction; Supervisor does not call a
  separate list command before deletion. Supervisor closes any attached v2
  WebSocket subscribers for those returned sessions with code `1000` and reason
  `Workspace deleted`, waits for any already-sent in-flight attach attempt for
  that session to settle, then kills those tmux sessions best-effort. The
  in-flight attach wait is bounded by the existing WorkerClient command timeout;
  the first slice does not add IPC cancellation. If Storage delete fails,
  subscriber close and tmux kill are not attempted. Missing
  workspace cleanup is idempotent: Storage returns
  `{ deleted: false, sessions: [] }`, does not record a `workspace.deleted`
  event, and Supervisor returns
  `{ deleted: false, killedSessions: [], failedKills: [] }` without subscriber
  close or tmux kill. Storage must check workspace existence before selecting
  cleanup sessions, so orphan tab rows for a missing workspace id do not become
  cleanup targets. If tmux kill fails after Storage deletion, the response
  includes `failedKills`. If a returned session has an invalid or unsafe
  `sessionName`, cleanup skips subscriber close and tmux kill for that raw value,
  records it in `failedKills`, and still returns the committed delete result.
  The `storage.delete-workspace` reply schema intentionally allows raw string
  session names for cleanup so IPC reply validation does not discard corrupt rows
  before Supervisor can reject unsafe tmux targets; attach/auth paths remain
  strict. Storage returns only `pending_terminal` and `ready` tabs as delete
  cleanup sessions. `failed` tabs are considered already reconciled and are not
  killed again during workspace cleanup.
  Orphan scan/reconciliation remains a follow-up Terminal Worker hardening
  concern.
- The first slice includes an automated smoke script that proves health,
  workspace create/list, tab create, v2 terminal attach, stdin, stdout, resize,
  and cleanup. Resize is proven by sending a `100x30` resize frame and requiring
  `stty size` output to include `30 100`.

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
- runtime v2 tmux namespace isolation with socket `codexmux-runtime-v2` and
  session prefix `rtv2-`
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

Worker script resolution is part of the contract:

| Mode | Worker Script | `execArgv` |
| --- | --- | --- |
| Development (`tsx watch server.ts`) | `${__CMUX_APP_DIR || cwd}/src/workers/*.ts` | `['--import', 'tsx']` |
| Web/npm production | `${__CMUX_APP_DIR || cwd}/dist/workers/*.js` | `[]` |
| Packaged Electron | `${__CMUX_APP_DIR_UNPACKED}/dist/workers/*.js` | `[]` |

Forked workers inherit the parent environment, including `NODE_PATH`, and
Supervisor injects `CODEXMUX_RUNTIME_DB` before workers start.

Packaged Electron must run workers and native modules from unpacked filesystem
paths. Verification must check `dist/workers/*.js`, `node-pty`, and runtime-v2
`better-sqlite3` availability from the same standalone/Electron layout, with
`app.asar.unpacked` assumptions explicit.

Runtime tmux config resolution follows the same app-dir rules. In every mode,
Terminal Worker expects `${appDir}/src/config/tmux.conf`; `scripts/post-build.js`
must copy it into `.next/standalone/src/config/tmux.conf`, and Electron
verification must prove the packaged runtime sees it under `app.asar.unpacked`.
Resolving the file is not enough: Terminal Worker must treat `tmux source-file`
failure as fatal `runtime-v2-tmux-config-source-failed`, while `kill-session`
cleanup remains best-effort.

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

Envelope validation is not enough. The first slice keeps a command registry for
all implemented `storage.*` and `terminal.*` commands plus an event registry for
first-slice realtime events. Each command registry entry defines:

- command payload schema
- successful reply payload schema
- shared runtime DTO type inferred from or aligned with the schema

Each event registry entry defines:

- expected worker source
- expected target
- delivery mode
- event payload schema

Supervisor-side clients validate registered command payloads before sending and
validate registered reply payloads before resolving a request. They validate
registered events before `onEvent` delivery. Worker services use a shared helper
to validate command envelopes before calling domain handlers: `source` must be
`supervisor`, `target` must be that worker name, `type` must be registered, and
`type` must stay inside the worker namespace. Mismatches with a command id return
a non-retryable `invalid-worker-command` failed reply; malformed commands without
an id are dropped.

Terminal dimension bounds are enforced at the IPC boundary too:
`terminal.create-session`, `terminal.attach`, and `terminal.resize` payloads
accept only `cols 1..500` and `rows 1..200`. WebSocket attach and resize paths
clamp user-provided dimensions before sending IPC, but oversized direct/internal
IPC callers fail validation instead of reaching Terminal Worker.

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

- Commands must have command-specific payload and reply schema validation.
- RuntimeWorkerClient reply correlation must validate more than `commandId`.
  Pending requests store expected worker source, target, and reply type; replies
  must match `source`, `target: "supervisor"`, and `<commandType>.reply` before
  payload validation or backoff/readiness success updates. Mismatches reject the
  request with non-retryable `invalid-worker-reply`. If envelope parsing fails
  but the raw message is reply-shaped and has a pending string `commandId`, the
  matching request is rejected immediately with non-retryable
  `invalid-worker-reply`; malformed replies without a known pending `commandId`
  are dropped. Reply envelopes are discriminated: `ok: true` replies must not
  include `error`; `ok: false` replies must include structured `error` and must
  use `payload: null`.
- RuntimeWorkerClient event delivery is registry-gated. First-slice registered
  events include `terminal.stdout` and `terminal.backpressure`; events must match
  expected source, `target: "supervisor"`, registered delivery mode, and payload
  schema before `onEvent` runs. Invalid or mismatched events are dropped without
  request rejection or worker restart.
- IPC constructors must validate their own output before returning. In
  particular, `createRuntimeReply()` must reject invalid discriminated reply
  shapes and invalid successful payloads for registered `<command>.reply` types;
  failed replies keep `payload: null` and structured `error` without command
  reply payload validation. `createRuntimeEvent()` must reject invalid registered
  event source/target/delivery/payload combinations so worker-side bugs fail at
  the producer boundary, not only at the Supervisor receiver.
- Worker-side command handling must validate `source === "supervisor"`,
  `target === workerName`, registered command type, and worker namespace before
  domain handlers run through a shared helper. The helper returns an error
  descriptor; each worker service wraps that descriptor in its own failed reply.
  Invalid commands with an id return non-retryable `invalid-worker-command`;
  invalid commands without an id are dropped by the worker entrypoint.
- Commands must have timeout handling. Timeout removes the request from the
  pending map and rejects with retryable `worker-timeout`; late success or failed
  replies for that `commandId` are ignored and must not resolve/reject again or
  reset restart/readiness backoff.
- Worker crash while a command is in flight returns a structured retryable error.
- Worker `error` and `exit` events share one child-failure path. Only the first
  failure for the current child calls `onExit`, rejects pending requests,
  best-effort kills the current child, cleans listeners, clears readiness, and
  schedules restart; later `error`/`exit` events from the same or stale child
  are ignored. Explicit worker shutdown cleans listeners, best-effort kills the
  child without throwing on kill failure, and does not schedule restart.
  Shutdown is terminal for that `RuntimeWorkerClient` instance: later `start()`
  is a no-op, and later `request()`/`waitUntilReady()` reject with non-retryable
  `worker-shutdown` instead of spawning a new child.
- Worker failed replies preserve structured `error.code` and `error.retryable`
  through `RuntimeWorkerClient` rejection so API routes can distinguish retryable
  worker failures from non-retryable domain errors.
- Storage Worker and Terminal Worker services preserve structured domain/runtime
  errors in failed replies. If an exception carries `code` or `retryable`, those
  fields are copied into the IPC reply instead of being collapsed to
  `command-failed`.
- Worker clients must run readiness checks before accepting traffic. Readiness
  failures caused by transport/lifecycle errors (`worker-timeout`,
  `worker-not-connected`, `worker-error`, `worker-exited`) route the captured
  child through the same best-effort kill/restart path. Normal worker failed
  replies are returned as readiness failures without restarting the child unless
  they use one of those lifecycle error codes.
- Worker path resolution must be covered by tests for development, web/npm
  production, and packaged Electron.
- Worker clients must cap pending requests and return a retryable
  `worker-overloaded` error before unbounded queue growth.
- Worker clients must use the `child.send(message, callback)` form. The boolean
  return value is treated only as a backpressure signal, not as send failure.
  If a request finds an existing child disconnected before send, the request
  rejects with retryable `worker-not-connected` and routes that child through the
  single child-failure path for best-effort kill/restart. If there is no current
  child, the request rejects with `worker-not-connected` without scheduling an
  additional restart.
  Callback errors and synchronous `child.send()` throws clear the timeout, remove
  the pending request immediately, and reject with retryable
  `worker-not-connected`, then route the captured child through the single
  child-failure path for best-effort kill/restart. If the request times out
  before the send callback runs, the later callback is ignored like any other
  late completion and does not restart the worker.
- Supervisor must restart crashed workers with increasing bounded backoff.
  "Successful reply" means the reply envelope and command-specific payload both
  validate; malformed successful replies reject with `invalid-worker-reply` and
  must not reset readiness/restart backoff. Explicit shutdown must not restart
  workers or allow the same worker-client instance to accept more traffic.
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

The first-slice event registry implements `terminal.stdout` and
`terminal.backpressure` as realtime-only. Other lifecycle event names are
reserved until their durable Storage-backed state transitions are implemented.
Lifecycle events that affect tab/session state are durable and must pass through
Storage Worker.

## SQLite Storage Model

The new durable app state lives at:

```text
~/.codexmux/runtime-v2/state.db
```

Existing JSON files are not the source of truth in the new runtime. The
prototype may back up existing `~/.codexmux/` and start clean.

For the first implementation slice, SQLite starts as an experimental parallel
state file. It must not delete or migrate the existing JSON stores. Reset is
explicit through `CODEXMUX_RUNTIME_V2_RESET=1`, which backs up only the runtime
v2 SQLite DB file and its WAL/SHM sidecars. Full app-state backup/export/reset
tooling is a later Storage Worker plan.

### Core Tables

Initial schema should include:

```text
schema_migrations
  version integer primary key
  applied_at text not null

workspaces
  id text primary key
  name text not null
  default_cwd text not null
  active integer not null default 0
  group_id text null references workspace_groups(id) on delete set null
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
  workspace_id text not null references workspaces(id) on delete cascade
  parent_id text null references panes(id) on delete cascade
  node_kind text not null
  split_axis text null
  ratio real null
  position integer not null
  active_tab_id text null references tabs(id) on delete set null
  created_at text not null
  updated_at text not null

tabs
  id text primary key
  workspace_id text not null references workspaces(id) on delete cascade
  pane_id text not null references panes(id) on delete cascade
  session_name text not null unique
  panel_type text not null
  name text not null default ''
  title text null
  cwd text null
  lifecycle_state text not null default 'ready'
  failure_reason text null
  order_index integer not null
  terminal_ratio real null
  terminal_collapsed integer not null default 0
  web_url text null
  last_command text null
  created_at text not null
  updated_at text not null

tab_status
  tab_id text primary key references tabs(id) on delete cascade
  cli_state text not null
  current_process text null
  pane_title text null
  agent_session_id text null references agent_sessions(id) on delete set null
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
layout JSON is a projection, not storage format. When Storage creates a pending
terminal tab, it assigns `order_index = max(order_index) + 1` within the target
pane in the same transaction. Finalizing a terminal tab makes that tab the
pane's `active_tab_id`. Layout projection sorts ready tabs by
`order_index asc, created_at asc, id asc`.

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
  tab_id text null references tabs(id) on delete set null
  agent_session_id text null references agent_sessions(id) on delete set null
  event_type text not null
  payload_json text not null
  source text not null
  created_at text not null
```

Event logs are for audit, debugging, recovery hints, and dedupe. They are not a
requirement to replay terminal output.

`schema_migrations` is not placeholder metadata. `openRuntimeDatabase()` must set
SQLite runtime pragmas explicitly: `busy_timeout = 5000`, `journal_mode = WAL`,
`synchronous = NORMAL`, and `foreign_keys = ON`. Then it runs
`runRuntimeMigrations(db)` and records migration v1 inside a transaction.
Reopening the same DB must not duplicate v1. Opening a DB with an applied
migration version greater than `CURRENT_RUNTIME_SCHEMA_VERSION` must fail with
non-retryable `runtime-v2-schema-too-new`. Persistent lock contention still
surfaces as a worker error; this slice does not add an application-level retry
loop around SQLite writes.

Initial schema indexes:

```text
idx_runtime_workspaces_group_order on workspaces(group_id, order_index, created_at)
idx_runtime_panes_workspace_parent_position on panes(workspace_id, parent_id, position)
idx_runtime_tabs_workspace_pane_order on tabs(workspace_id, pane_id, order_index)
idx_runtime_tabs_lifecycle_state_created_at on tabs(lifecycle_state, created_at)
idx_runtime_mutation_events_created_at on mutation_events(created_at)
idx_runtime_status_events_tab_created_at on status_events(tab_id, created_at)
idx_runtime_agent_sessions_provider_source on agent_sessions(provider, source_id)
idx_runtime_remote_sources_label_host on remote_sources(source_label, host)
```

## API And UI Contract

API routes move to a v2 contract that maps to worker commands and queries.
The eventual v2 route family includes:

```text
GET  /api/v2/runtime/health
GET  /api/v2/workspaces
POST /api/v2/workspaces
DELETE /api/v2/workspaces/:id
GET  /api/v2/workspaces/:id/layout
POST /api/v2/tabs
PATCH /api/v2/tabs/:id
DELETE /api/v2/tabs/:id
GET  /api/v2/tabs/:id/status
WS   /api/v2/terminal?session=:sessionName
GET  /api/v2/timeline/sessions
GET  /api/v2/timeline/entries
POST /api/v2/remote/codex/sync
```

The first implementation slice implements only:

```text
GET    /api/v2/runtime/health
GET    /api/v2/workspaces
POST   /api/v2/workspaces
DELETE /api/v2/workspaces/:id
GET    /api/v2/workspaces/:id/layout
POST   /api/v2/tabs
WS     /api/v2/terminal?session=:sessionName
```

Other v2 routes remain follow-up work. First-slice HTTP routes return `405`
with an exact `Allow` header for unsupported methods before Supervisor access.
The first implementation fixes the terminal WebSocket route shape as
`/api/v2/terminal?session=:sessionName`. Other follow-up route shapes can be
refined in later plans, but the rule is fixed: API routes are adapters. They do
not mutate filesystem stores or tmux directly.
The `sessionName` query parameter is an identifier for an existing ready tab,
not an authority to create, attach, or kill arbitrary tmux sessions. Supervisor
checks Storage before allowing the Terminal Worker attach path. The `session`
query parameter must appear exactly once; missing, empty, or duplicated
`session` parameters fail as `400 invalid-runtime-v2-terminal-session`. If a first-slice
client sends `MSG_KILL_SESSION`, the WebSocket is closed as unsupported and no
Terminal Worker kill command is sent.

API routes must not construct worker clients or a separate Supervisor instance.
They call `getRuntimeSupervisor()`, await `ensureStarted()`, and then call the
required Supervisor method. Concurrent API requests and the custom server eager
start must coalesce into one worker startup sequence.

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

The first UI surface is an experimental operational page, not a new product
screen. It remains URL-only in the first slice, with no sidebar or primary
navigation entry. It should stay dense and diagnostic: list v2 workspaces, create
a v2 workspace, create a terminal tab, attach through `/api/v2/terminal`, send
`pwd`, and show stdout plus raw JSON. It must preserve SSR locale hydration even
if the visible copy is intentionally minimal.

Mobile uses the same smoke flow in a compact diagnostic layout. The page may
stack sections vertically and collapse raw JSON, but it must still support
health, workspace list/create, tab create, v2 attach, stdin, stdout,
resize-safe rendering, and reconnect/error display on Android WebView and
mobile Safari.

All visible copy on the experimental page follows the product locale policy:
Korean and English message bundles are updated together, and server-rendered
props load the message bundle for SSR hydration. Diagnostic JSON keys can remain
raw protocol names, but labels, buttons, status text, and error text are not
English-only hardcoded strings.

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
- `corepack pnpm build:electron` succeeds with runtime worker outputs included
- runtime native verification resolves `node-pty` and runtime-v2
  `better-sqlite3` from the standalone/Electron module tree
- runtime tmux config verification resolves `src/config/tmux.conf` from the
  standalone/Electron layout
- packaged local server assumptions keep workers and native bindings outside
  `app.asar` by using `app.asar.unpacked`/`__CMUX_APP_DIR_UNPACKED`
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

For Terminal Worker crash in the first slice, Supervisor closes all attached v2
terminal WebSockets with retryable code `1001` and reason `Terminal worker exited`, clears
the subscriber map, and does not send `terminal.detach` for the lost
worker-owned attachments. WorkerClient restarts the Terminal Worker and runs
readiness. After readiness succeeds, recovery is a fresh `/api/v2/terminal`
connection that attaches the existing `rtv2-` tmux session again. Terminal stdout
is not replayed after worker crash. HTTP/API commands that fail before a
WebSocket is established surface retryable structured errors and map to `503`;
commands sent over an already-open v2 terminal WebSocket close that socket with
`1011`.

Initial Supervisor startup is also readiness-gated. `ensureStarted()` is
successful only after Storage Worker readiness, Terminal Worker readiness, and
startup reconciliation all complete. If any of those steps fails, Supervisor
does not mark itself started, shuts down workers created during that attempt,
clears the in-flight start promise, and lets the next request retry from a clean
worker lifecycle.
Startup reconciliation completion requires durable Storage state transition for
stale pending intents. Killing matching v2 tmux sessions is best-effort, but
`storage.fail-pending-terminal-tab` failure is fatal to startup so pending rows
cannot remain pending while Supervisor reports itself started. If a stale
pending row contains an invalid or unsafe `sessionName`, Supervisor must not pass
that value to tmux. It skips tmux cleanup for that row and still durably marks
the pending intent failed; only failure to commit that Storage transition is
fatal to `ensureStarted()`.

### Storage Failure

If Storage Worker cannot commit a durable event:

- the originating command fails
- Supervisor does not broadcast durable state as successful
- pending durable intents remain visible only to runtime reconciliation paths, not
  to the normal layout projection
- runtime side effects that already happened must be reconciled explicitly

For first-slice tab creation, the sequence is fixed:

1. Supervisor generates `tabId` and `sessionName`.
2. Supervisor asks Storage Worker to create a pending terminal-tab intent with
   the Supervisor-supplied id and session name.
3. Supervisor asks Terminal Worker to create the tmux session in the
   `codexmux-runtime-v2` socket with an `rtv2-` session name.
4. Supervisor asks Storage Worker to finalize the pending tab.
5. If terminal creation fails after the command was sent, Supervisor asks
   Terminal Worker to kill that session best-effort and marks the pending tab
   failed. The kill may be a no-op if tmux never created the session, but it
   also cleans partial-create failures such as post-create config source errors.
6. If finalize fails after the terminal create command was sent, Supervisor asks
   Terminal Worker to kill that session best-effort and marks the pending tab
   failed.
7. Only a finalized tab is visible in normal durable UI projections.

This ordering ensures every terminal side effect has a durable intent first.
Rollback follows the same durability rule: if
`storage.fail-pending-terminal-tab` fails while handling a terminal create or
finalize failure, Supervisor surfaces that Storage failure instead of hiding it.
Terminal kill during rollback remains best-effort, but durable pending-intent
state transition failures are fatal to the originating `createTerminalTab()`
call and are retried later by startup reconciliation. Storage treats
`finalize-terminal-tab` and `fail-pending-terminal-tab` operations that change
zero pending rows as non-retryable `runtime-v2-pending-tab-not-found`; missing,
already-finalized, and already-failed tab ids are not successful pending-tab
lifecycle transitions.
Startup reconciliation can safely find stale pending intents, kill matching v2
tmux sessions best-effort when their stored names pass runtime session-name
validation, and mark those intents failed. Invalid pending `sessionName` values
are never sent to tmux and are still marked failed in Storage. If the Storage
state transition fails, startup reconciliation fails and the next
`ensureStarted()` retries it.
The `sessionName` in this flow is generated by Supervisor through the runtime
session-name helper. Unsafe or too-long workspace/pane/tab identifiers fail
before any Storage Worker or Terminal Worker command is sent.
Storage Worker also verifies that the supplied pane belongs to the supplied
workspace before creating the pending tab. A missing pane or workspace/pane
mismatch fails with a non-retryable structured error before Terminal Worker
receives any create-session command.
After the tab is finalized, the stored ready tab row becomes the authority for
terminal WebSocket attach. Pending, failed, stale, or fabricated `rtv2-` session
names are rejected before Terminal Worker receives an attach command.
User-initiated kill remains a follow-up because it needs durable lifecycle state
to avoid ready tabs pointing at killed tmux sessions.

### Supervisor Restart

Startup order:

1. Initialize config/auth/access filter enough to accept health/onboarding paths.
2. Start Storage Worker.
3. Run storage readiness and schema checks.
4. Start Terminal Worker.
5. Run terminal readiness checks.
6. Reconcile tmux sessions with SQLite tab/session projection.
7. Mark Supervisor started only after reconciliation succeeds.
8. Start Timeline/Status workers when implemented.
9. Reconcile Codex JSONL, remote sidecars, process state, and status projection.
10. Start public HTTP/WebSocket serving.

## Rollout And Rollback

Implementation happens on a separate branch.

The first implementation target is an experimental entrypoint, not production
replacement. The production replacement happens only after the prototype passes
process-level and platform smoke tests.

Rollback strategy is reset-first:

- leave existing JSON stores untouched during the experimental runtime
- keep v2 tmux sessions in the separate `codexmux-runtime-v2` socket so
  production tmux reset and scan flows do not own them
- reuse `~/.codexmux/runtime-v2/state.db` by default so smoke can test
  persistence
- set `CODEXMUX_RUNTIME_V2_RESET=1` to move the existing SQLite DB to a
  timestamped backup and start with a fresh DB; reset must also move WAL/SHM
  sidecars when either sidecar exists without the main DB
- restore the backup if the branch is abandoned

The rollout does not maintain long-running compatibility between old JSON
stores and new SQLite state.

## Verification Gates

Required before replacing the old runtime:

- IPC schema, timeout, and late-reply-ignore tests
- WorkerClient failed-reply tests proving structured `code`/`retryable` fields
  survive Supervisor rejection and API error mapping
- API handler tests for explicit runtime v2 domain error status mapping:
  validation `400`, missing resources `404`, conflicts `409`, retryable worker
  failures `503`, and startup/configuration failures `500`
- runtime session-name generation/rejection tests for tmux-safe `rtv2-` names
- runtime terminal attach authorization tests proving only Storage-backed ready
  terminal tabs can reach Terminal Worker, plus WebSocket kill-unsupported tests
  proving `MSG_KILL_SESSION` does not call Terminal Worker
- runtime v2 auth tests for HTTP and WebSocket cookie/header acceptance plus
  query-string credential rejection
- Storage Worker schema and invariant tests
- Storage repository/service tests for workspace/pane ownership validation before
  pending terminal-tab creation
- Storage repository/service tests proving `finalize-terminal-tab` and
  `fail-pending-terminal-tab` each require exactly one pending row and return
  `runtime-v2-pending-tab-not-found` for missing, already-finalized, or
  already-failed tab ids
- Storage repository tests proving terminal tabs in the same pane get stable
  incremental order, finalization updates `active_tab_id`, and layout projection
  sorts by `order_index`, `created_at`, then `id`
- Storage migration runner tests for fresh v1 creation, idempotent reopen, and
  `runtime-v2-schema-too-new`
- Storage schema tests proving runtime SQLite pragmas are applied:
  `busy_timeout = 5000`, WAL journal mode, `synchronous = NORMAL`, and
  `foreign_keys = ON`
- runtime path tests for worker scripts and `src/config/tmux.conf`, including
  `runtime-v2-worker-script-missing` and `runtime-v2-tmux-config-missing`
- Terminal Worker runtime wrapper tests proving `tmux source-file` failures
  preserve `runtime-v2-tmux-config-source-failed` with `retryable: false`,
  attempt best-effort cleanup of the just-created session, and keep the original
  source failure even if cleanup kill fails
- Terminal Worker runtime wrapper attach tests proving missing tmux sessions fail
  before `node-pty` spawn with non-retryable
  `runtime-v2-terminal-session-not-found`
- Supervisor readiness/restart tests
- Supervisor singleton and concurrent `ensureStarted()` tests proving custom
  server/API route calls share `globalThis.__ptRuntimeSupervisor` and one
  in-flight start promise
- Supervisor reset backup tests proving `state.db`, `state.db-wal`, and
  `state.db-shm` are backed up independently when any one exists, including
  sidecar-only cases, and repeated `ensureStarted()` calls do not back up twice
- Supervisor startup failure tests proving readiness/reconciliation failures,
  including `storage.fail-pending-terminal-tab` failures, do not set `started`,
  shut down partial workers, clear the start promise, and retry cleanly on the
  next `ensureStarted()`
- Supervisor startup reconciliation tests proving invalid pending `sessionName`
  values are never sent to `terminal.kill-session`, but are still durably failed
  with `storage.fail-pending-terminal-tab`
- Supervisor workspace delete tests proving invalid listed `sessionName` values
  are not sent to `terminal.kill-session`, do not close subscribers for unsafe
  raw values, and are reported in `failedKills` after Storage deletion commits
- Supervisor workspace delete tests proving a deleted session with an in-flight
  attach closes subscribers first, waits for that already-sent attach attempt to
  settle, does not cancel the attach IPC command, and only then sends
  best-effort `terminal.kill-session`
- Storage/Supervisor workspace delete tests proving
  `storage.delete-workspace` returns deleted terminal sessions from inside the
  delete transaction and Supervisor does not call a separate list command before
  cleanup
- Storage workspace delete tests proving `pending_terminal` and `ready` tabs are
  returned for cleanup while `failed` tabs are excluded
- IPC tests proving `storage.delete-workspace` accepts raw cleanup session
  strings in replies while attach/auth command schemas still require strict
  `runtimeSessionNameSchema`
- Storage/Supervisor workspace delete tests proving missing workspace cleanup is
  idempotent `{ deleted: false }`, records no `workspace.deleted` event, closes
  no subscribers, sends no `terminal.kill-session`, and ignores orphan tab rows
  for the missing workspace id
- Supervisor terminal subscriber refcount/fanout tests proving duplicate
  WebSocket subscribers for one session send only one `terminal.attach`, receive
  the same stdout fanout, and send `terminal.detach` only after the last
  subscriber leaves; concurrent subscribers that arrive during an in-flight
  attach wait for the same attach result; in-flight attach failure after the
  attach command is sent must clean up every subscriber from that attach attempt,
  send best-effort `terminal.detach`, preserve the original attach failure for
  all waiting callers, and leave the session unattached
- Supervisor stdin/resize authorization tests proving missing or detached
  `subscriberId` values return `runtime-v2-terminal-subscriber-not-found` and do
  not call Terminal Worker
- v2 terminal WebSocket queue tests proving rapid stdin frames are delivered to
  Supervisor in order, and queued frames after the first command failure do not
  call Supervisor or Terminal Worker
- v2 terminal WebSocket attach lifecycle tests proving close/error while attach
  is pending registers before attach resolves, and a later successful attach
  detaches the returned subscriber exactly once
- v2 terminal WebSocket/Supervisor attach lifecycle tests proving the first slice
  does not cancel already-sent `terminal.attach`; when every subscriber waiting
  on an in-flight attach closes and attach later succeeds, all subscribers are
  removed and Terminal Worker receives one final `terminal.detach`
- v2 terminal WebSocket input backpressure tests proving frame-count and
  queued-byte limits close with `1011 Terminal input backpressure`, detach once,
  and do not pass overflow input to Supervisor or Terminal Worker
- v2 terminal dimension tests proving invalid attach query values, including
  `1e2`, `0x10`, signed numbers, decimals, zero, leading-zero values, empty
  strings, decoded whitespace, and duplicated `cols` or `rows`, default to
  `80x24`; duplicated dimensions fall back independently; oversized attach/resize
  values clamp to `500x200`; later subscriber attach query dimensions do not
  auto-resize an already-attached shared pty; and zero or short resize payloads
  are ignored
- Terminal Worker process tests with real tmux/node-pty; Linux CI must install
  `tmux` and may not skip this gate for missing Linux prerequisites
- process-level runtime test for real tmux create, `node-pty` attach, stdin,
  stdout, resize, and kill in the isolated `codexmux-runtime-v2` socket
- Terminal Worker stdout coalescing, byte accounting, Unicode-safe frame
  splitting, attached-session gating for late pty output, detach/kill clear
  behavior, backpressure, and buffered-partial-discard unit tests
- Terminal Worker service structured-error preservation tests for runtime errors
  such as `runtime-v2-worker-script-missing`,
  `runtime-v2-tmux-config-missing`, and
  `runtime-v2-tmux-config-source-failed`
- automated runtime v2 smoke for health, workspace create/list, tab create,
  `/api/v2/terminal` attach, stdin, stdout, resize, and cleanup. The resize
  assertion sends `100x30` and requires `stty size` output `30 100`
- minimal UI terminal smoke through the v2 WebSocket
- Supervisor restart recovery test
- Terminal Worker crash/restart test
- Terminal Worker exit WebSocket close/reconnect test: existing v2 terminal
  sockets close with `1001 Terminal worker exited`, subscriber state is cleared,
  and a fresh `/api/v2/terminal` connection attaches again after restart/readiness
- pending terminal-tab finalize failure test
- pending terminal-tab rollback failure tests proving Supervisor attempts
  best-effort `terminal.kill-session` after any sent create command fails or
  finalize fails, and `storage.fail-pending-terminal-tab` failures are surfaced
  to the caller instead of being hidden behind the original terminal/finalize
  error
- optional native SQLite install/build/packaging verification with runtime v2 on,
  including standalone/Electron native binding resolution for `node-pty` and
  `better-sqlite3`, Electron ABI rebuild/unpack assumptions, and runtime v2 off
  build verification that does not load the SQLite binding
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
  helpers and must share the `globalThis.__ptRuntimeSupervisor` singleton with
  the custom server. Worker health, restart, timeout, startup coalescing, and
  reconciliation become core runtime concepts.

### ADR Draft: SQLite App State

- Status: Proposed
- Decision: Replace JSON-file app state for workspace/layout/tab/status metadata
  with `~/.codexmux/runtime-v2/state.db`, owned by Storage Worker. The
  experimental first slice reuses this DB by default and resets it only when
  `CODEXMUX_RUNTIME_V2_RESET=1` is set. Reset backs up `state.db`,
  `state.db-wal`, and `state.db-shm` independently when any one of those files
  exists.
- Rationale: normalized entities, transactions, invariant enforcement, indexed
  queries, and event logs are difficult to maintain safely across many JSON
  files and direct module callers.
- Consequences: legacy JSON compatibility is not required for the first
  redesign. Existing JSON stores remain untouched while the parallel runtime is
  experimental. Backup/reset is explicit for the SQLite DB. Codex-owned JSONL
  remains read-only and separate.

### ADR Draft: Typed IPC

- Status: Proposed
- Decision: Use `child_process.fork` and typed envelope messages for first
  worker transport, backed by command and event registries that validate command
  payloads, successful reply payloads, and first-slice event payloads.
- Rationale: Node IPC is the simplest process boundary that preserves TypeScript
  reuse and avoids internal ports while proving the worker architecture.
- Consequences: all commands need schema validation, correlation ids, timeouts,
  structured errors, registered reply schemas, event delivery validation, and
  process-level tests.

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

### ADR Draft: Runtime V2 Auth Surface

- Status: Proposed
- Decision: Runtime v2 HTTP APIs and `/api/v2/terminal` use the existing
  authenticated app surface. HTTP accepts session cookie auth or `x-cmux-token`.
  `/api/v2/terminal` accepts session cookie auth or `x-cmux-token` during
  upgrade, but only Node clients may use the header. Browser/Electron/Android
  WebView clients rely on session cookies, and token query parameters are
  rejected on both HTTP and WebSocket runtime v2 surfaces. The rejected query
  credential names are the case-insensitive denylist `token`, `x-cmux-token`,
  `authorization`, `auth`, `api_key`, `apikey`, `access_token`, and
  `session-token`; the terminal `session` query parameter remains allowed but
  must appear exactly once.
  Malformed HTTP auth URLs fail closed as authentication failures. Missing,
  empty, non-origin-form, raw non-ASCII/control/space/hash-containing,
  malformed percent-encoding, encoded path delimiters, or malformed WebSocket
  upgrade URLs return `400 invalid-websocket-url`. Absolute-form, protocol-relative,
  authority-form, and asterisk-form request targets are rejected before auth.
  Raw `#`, Korean, emoji, and other non-ASCII request-target characters are
  rejected before auth. Malformed percent escapes such as trailing `%`, `%2`,
  or `%GG` are rejected before auth; well-formed percent-encoded whitespace,
  hash, or UTF-8 such as `%20`, `%23`, `%ED%95%9C%EA%B8%80`, or
  `%F0%9F%98%80` remains allowed when the rest of the origin-form URL is valid.
  Well-formed encoded slash or backslash delimiters, `%2F` or `%5C`, are
  rejected in the path before auth because downstream layers may normalize them
  as path separators; the path-delimiter guard does not reject those sequences
  in query values.
  Runtime v2 WebSocket namespace paths other than the exact
  `/api/v2/terminal` route, including `/api/v2`, `/api/v2?x=1`,
  `/api/v2/terminal/`, `/api/v2/runtime/health`, and `/api/v2/unknown`, return
  `404 runtime-v2-upgrade-not-found` before auth, known upgrade handling, or
  fallback proxying.
  WebSocket auth verifier exceptions fail closed as `401 Unauthorized` through
  the same JSON helper, with `socket.end(response)` first and
  `safeDestroySocket()` only when `end()` throws. Runtime
  v2 HTTP APIs and `/api/v2/terminal` both return `404 runtime-v2-disabled`
  before auth when `CODEXMUX_RUNTIME_V2` is not enabled.
- Rationale: Browser, Electron, Android, and CLI smoke should exercise the same
  server auth boundary without adding a public debug path.
- Consequences: automated runtime v2 smoke authenticates with the existing CLI
  token in a WebSocket header. The experimental UI opens a relative WebSocket URL
  and relies on the authenticated session cookie. `/api/v2/terminal` is not
  unauthenticated, and credentials are never accepted in the query string.

## Deferred Implementation Decisions

These decisions are intentionally deferred to follow-up implementation plans:

- exact package/module layout for worker code
- exact production-grade terminal reconnect and advanced throttling behavior
- full Storage Worker command coverage and invariant set
- Timeline Worker and Status Worker migration details
- platform smoke automation beyond the first Linux web/API smoke

None of these change the approved architecture.
