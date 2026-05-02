# Runtime Architecture Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the experimental Supervisor + Terminal Worker + SQLite Storage Worker slice that proves worker-owned storage plus worker-owned terminal attach/input/output without replacing the production runtime yet.

**Architecture:** The first slice runs behind `CODEXMUX_RUNTIME_V2=1`. Supervisor starts typed Node IPC workers with readiness and bounded restart, Storage Worker owns a SQLite database at `~/.codexmux/runtime-v2/state.db`, and Terminal Worker owns tmux/node-pty lifecycle in a separate `codexmux-runtime-v2` tmux socket plus the v2 terminal WebSocket attach/stdin/stdout/resize path. Existing Pages Router stays in place; new API v2 endpoints, a v2 terminal WebSocket, an automated smoke script, and one experimental UI page exercise the new runtime.

**Tech Stack:** Next.js Pages Router, TypeScript, Node `child_process.fork`, `zod`, `better-sqlite3`, `ws`, `node-pty`, tmux, Vitest.

---

## Scope

This plan implements the first experimental runtime slice only. It does not move Timeline/Status workers into production, does not replace current API routes, does not migrate existing JSON state, and does not add Windows pty relay. It does include the minimum v2 terminal byte path required to prove that Terminal Worker, not the old `/api/terminal` runtime, can attach to tmux, receive stdin, emit stdout, resize, and detach.

The plan is intentionally experimental, but it must still protect user data:

- `CODEXMUX_RUNTIME_V2=1` reuses an existing `~/.codexmux/runtime-v2/state.db` and applies migrations.
- `CODEXMUX_RUNTIME_V2_RESET=1` moves any existing runtime SQLite DB file or
  WAL/SHM sidecar to timestamped backups before creating a fresh DB.
- `CODEXMUX_RUNTIME_V2=1` alone must never delete an existing DB.

## Engineering Review Guardrails

The first slice intentionally touches many files because it proves two worker
boundaries end to end. To keep that breadth from becoming a rewrite, these
guardrails are binding:

- Keep runtime v2 behind `CODEXMUX_RUNTIME_V2=1`; do not change production
  `/api/terminal`, `/api/timeline`, `/api/status`, or JSON store behavior.
- Do not commit or push during implementation unless the user explicitly asks.
  Task checkpoints must record changed files and verification status only.
- Introduce exactly two worker processes in this plan: Storage Worker and
  Terminal Worker. Timeline Worker, Status Worker, Windows relay, and provider
  expansion stay out of scope.
- Limit v2 HTTP APIs to health, workspace list/create, workspace delete for
  smoke cleanup, layout projection, and terminal tab create. Do not migrate
  config/auth/keybinding/session-history commands in this slice.
- Implement `/api/v2/terminal` only to prove attach/stdin/stdout/resize/detach
  for smoke. Minimal stdout coalescing/backpressure is in scope to prevent
  unbounded Worker-to-Supervisor IPC growth. Production parity features such as
  reconnect recovery and full lifecycle reconciliation remain follow-up work.
- First-slice Terminal Worker crash recovery is close-and-reattach only:
  attached v2 terminal WebSockets close with code `1011` and reason
  `Terminal worker exited`; stdout replay and automatic client resubscribe are
  out of scope.
- Isolate v2 terminal side effects from production tmux: Terminal Worker must
  use tmux socket `codexmux-runtime-v2` and session prefix `rtv2-`, not the
  production `codexmux` socket or `pt-` sessions.
- Treat Electron/native module packaging as verification coverage, not a full
  platform packaging migration. The plan must prove `node-pty` and optional
  `better-sqlite3` native bindings resolve from the standalone/Electron layout,
  and must not redesign Electron distribution.
- Any implementation work that requires more worker types, more API resource
  families, or production route replacement must stop and become a follow-up
  plan.

## Plan Grilling Resolutions

These decisions are binding and override any older skeleton-only wording in this document:

- Runtime v2 must include a minimal Terminal Worker-owned WebSocket path. Reusing old `/api/terminal` for the smoke is not enough.
- `/api/v2/terminal?session=...` bridges Supervisor to Terminal Worker attach/stdin/stdout/resize/detach. `terminal.stdout` and `terminal.backpressure` are realtime IPC and are not durable.
- Terminal Worker must create and attach sessions in the separate tmux socket
  `codexmux-runtime-v2` with session names that start with `rtv2-`. Production
  tmux reset/scan/status code must not observe or kill v2 sessions.
- v2 tmux session names must be Supervisor-generated only. HTTP and WebSocket
  callers never supply a new session name for tab creation; they can only attach
  to an existing tab's stored `sessionName`. The generated name must pass a
  strict tmux-target-safe schema: `rtv2-` prefix, lowercase alphanumeric/dash
  characters only, and a bounded maximum length.
- v2 terminal WebSocket attach is authorized by Storage state, not by
  session-name shape alone. Supervisor must attach only `sessionName` values
  that exist as finalized `ready` terminal tabs in Storage; stale pending,
  failed, orphan, or fabricated `rtv2-` names are rejected before Terminal Worker
  receives a command. User-initiated `MSG_KILL_SESSION` is unsupported in the
  first slice because there is no durable `closing`/`closed` tab lifecycle yet.
  After attach, v2 stdin and resize commands must include the active
  `subscriberId`; Supervisor rejects missing or detached subscribers with
  non-retryable `runtime-v2-terminal-subscriber-not-found` before Terminal
  Worker receives stdin or resize. The WebSocket handler must serialize
  per-socket terminal messages so stdin/resize/kill frames are processed in
  receive order; after the first command failure closes and detaches the socket,
  already-queued messages become no-ops. Each socket must also cap queued input
  at 256 frames or 1 MiB of raw queued payload; exceeding either limit closes the
  socket with `1011 Terminal input backpressure`, detaches, and prevents further
  Terminal Worker input. The handler must register close/error cleanup before
  awaiting `attachTerminal()`. If the socket closes while attach is pending and
  attach later succeeds, it immediately detaches the returned subscriber once and
  returns. The first slice does not cancel an already-sent `terminal.attach` IPC
  command; attach cleanup happens after attach resolves. If every subscriber
  waiting on an in-flight attach closes before attach resolves, the successful
  attach is followed by normal subscriber detach cleanup, with only the final
  detach sending `terminal.detach` to Terminal Worker. Attach query dimensions
  and resize frames use the same bounds:
  missing/invalid attach dimensions default to `80x24`, valid attach query
  values must be unsigned decimal positive integer strings without signs,
  decimal points, radix prefixes, exponents, decoded whitespace, or leading
  zeroes, duplicated `cols` or `rows` query parameters fall back for that
  dimension, and valid values are clamped to `cols 1..500` and `rows 1..200`;
  short or zero resize payloads remain ignored. For multiple subscribers on one shared pty, only the first
  successful Terminal Worker attach attempt's dimensions become the initial pty
  size. Later subscriber attach query dimensions do not auto-resize the pty;
  only explicit resize frames resize it, and the last accepted resize wins.
  Terminal Worker kill remains available only for Supervisor-owned cleanup paths
  such as workspace deletion, pending-intent reconciliation, finalize failure
  rollback, and process-level integration cleanup.
- Terminal Worker must coalesce stdout events with a bounded per-session buffer
  and emit registered realtime `terminal.backpressure` before detaching a
  session that exceeds the cap.
- Terminal Worker stdout frame splitting must be Unicode-safe. It must split by
  complete JavaScript code points, not by `string.slice()` code units, so Korean
  text and emoji are not corrupted at byte-limit boundaries.
- Terminal Worker stdout buffering must keep explicit `{ chunks, bytes, timer }`
  state. Append uses `Buffer.byteLength(data, 'utf8')`; backpressure is decided
  before appending by `current.bytes + incomingBytes > maxPendingStdoutBytes`;
  flush joins buffered chunks once and then applies the Unicode-safe
  `splitByByteLimit()`. Flush is timer-driven only while the session remains in
  normal attached flow. On detach, kill, or backpressure, buffered partial output
  is cleared and must not be emitted later as `terminal.stdout`.
- Terminal Worker service must also track `attachedSessions`. `onData` from
  node-pty appends stdout only while `attachedSessions.has(sessionName)` is true.
  Detach, kill, and backpressure remove the session before clearing stdout so
  late pty output cannot recreate a buffer or emit stale `terminal.stdout`.
- Supervisor owns stdout fanout and keeps a per-session subscriber refcount.
  For a given `sessionName`, the first subscriber sends `terminal.attach` to
  Terminal Worker, subscribers that arrive during the first attach wait on the
  same attach result, subscribers that arrive after a successful attach only
  join the Supervisor fanout map, and the last detach sends `terminal.detach`.
  Terminal Worker owns at most one pty attach/stdout stream per session in this
  first slice. Supervisor tracks one in-flight attach attempt per session. If
  that attach fails after Supervisor sends `terminal.attach`, Supervisor removes
  every subscriber that joined that attach attempt and sends best-effort
  `terminal.detach`; detach failure is hidden and the original attach failure is
  preserved for all waiting callers.
- `RuntimeWorkerClient` must implement readiness checks, retryable structured
  failures for in-flight commands on crash, timeout cleanup with late replies
  ignored, strict reply envelope correlation, registry-gated event delivery,
  malformed reply rejection by `commandId`, discriminated reply envelope schema,
  IPC constructor output validation, disconnected-child restart before send,
  send-failure escalation, single child-failure handling for `error`/`exit`,
  best-effort child kill on failure, bounded restart/backoff with reset only
  after validated successful replies, readiness transport failure restart,
  pending request overload protection, and terminal-instance clean shutdown.
- `RuntimeWorkerClient` must preserve structured worker reply errors. When a
  worker returns `ok: false`, Supervisor-side rejection keeps `error.code` and
  `error.retryable` so API routes can distinguish retryable worker failures from
  non-retryable domain errors such as `runtime-v2-pane-workspace-mismatch`.
- Supervisor singleton state must live on `globalThis` as
  `__ptRuntimeSupervisor`, with a shared in-flight `startPromise` and prepared DB
  path guard. `server.ts` may eager-start the Supervisor, but Next API routes
  must only retrieve the same singleton and await `ensureStarted()`; they must
  not construct separate workers.
- `ensureStarted()` succeeds only after both workers pass readiness and startup
  reconciliation completes. If readiness or reconciliation fails, `started`
  stays false, the in-flight start promise is released, already-started workers
  are shut down, and the next request gets a clean retry.
- Startup reconciliation is complete only when every stale pending terminal tab
  is durably transitioned with `storage.fail-pending-terminal-tab`. Killing a
  matching v2 tmux session during reconciliation is best-effort, but failing to
  mark the pending intent failed is fatal to `ensureStarted()`. If a stale
  pending row contains an invalid or unsafe `sessionName`, Supervisor skips the
  tmux kill and still marks the pending intent failed; invalid pending
  `sessionName` values must never be sent as tmux targets.
- Terminal Worker exit closes all attached v2 terminal subscribers, clears the
  subscriber map, lets WorkerClient restart/readiness run, and requires a fresh
  `/api/v2/terminal` attach for recovery. No stdout replay or automatic
  resubscribe is provided in this slice.
- IPC validation must include command-specific payload and reply schemas for all
  first-slice `storage.*` and `terminal.*` commands, not only the common
  envelope shape.
- Worker script resolution must be explicit for development, web/npm
  production, and packaged Electron. Electron workers load from
  `__CMUX_APP_DIR_UNPACKED`; dev workers use `tsx`; production workers use built
  JavaScript under `dist/workers`. Missing resolved worker scripts fail as
  non-retryable `runtime-v2-worker-script-missing` before `fork()`.
- Runtime tmux config resolution must be explicit for development, web/npm
  production, and packaged Electron. Terminal Worker uses
  `resolveRuntimeTmuxConfigPath()` only; missing `src/config/tmux.conf` fails as
  non-retryable `runtime-v2-tmux-config-missing`, and `tmux source-file`
  failure fails as non-retryable `runtime-v2-tmux-config-source-failed`. If
  `tmux new-session` succeeds and a later create step fails, Terminal Worker
  best-effort kills the just-created session before returning the original
  failure; Supervisor keeps its rollback kill as a fallback.
- `better-sqlite3` native dependency handling is part of the first plan, but it
  must be an optional dependency loaded lazily by Storage Worker. Runtime v2
  disabled installs/builds must not fail just because SQLite native binding is
  unavailable.
- Electron/native verification must prove `node-pty` and runtime-v2
  `better-sqlite3` resolve from the standalone/Electron module tree, and runtime
  v2 on must fail verification if SQLite is missing or unpacked incorrectly.
- The first plan must include a process-level Terminal Worker runtime integration
  test that uses real tmux and real `node-pty`, not only fake runtime service
  tests and the full server smoke.
- Linux CI must install `tmux` and resolve the `node-pty` native binding for
  that process-level test. Linux skip is not allowed; only non-Linux runners may
  skip this specific integration test.
- Terminal tab creation records a durable pending intent before any tmux side
  effect: Supervisor generates tab ids/sessionName, asks Storage Worker to
  create a pending terminal tab, asks Terminal Worker to create the tmux
  session, then asks Storage Worker to finalize the tab. After Supervisor sends
  `terminal.create-session`, any terminal create or finalize failure attempts a
  best-effort `terminal.kill-session` for that session before marking the
  pending intent failed. The kill may be a no-op when tmux never created the
  session, but it also cleans partial-create failures such as post-create config
  source failures. If `storage.fail-pending-terminal-tab` fails during rollback,
  that Storage failure is returned instead of being swallowed; tmux kill remains
  best-effort cleanup. Pending-tab lifecycle transitions are strict: finalize
  and failed-intent updates must change exactly one pending row. Missing,
  already-finalized, or already-failed tab ids fail with non-retryable
  `runtime-v2-pending-tab-not-found`.
- Storage Worker must validate that `paneId` belongs to the supplied
  `workspaceId` before creating a pending terminal tab. A missing pane or
  workspace/pane mismatch fails with non-retryable `runtime-v2-pane-not-found`
  or `runtime-v2-pane-workspace-mismatch` before any Terminal Worker command.
- The first SQLite schema creates the full foundation tables from the approved design, even if repository commands only cover workspace/tab/layout and event append.
- Storage Worker assigns terminal tab order inside the pending tab transaction:
  new tabs use `max(order_index) + 1` within the target pane, finalization makes
  the finalized tab active, and layout projection sorts by
  `order_index asc, created_at asc, id asc`.
- `openRuntimeDatabase()` sets SQLite pragmas explicitly:
  `busy_timeout = 5000`, `journal_mode = WAL`, `synchronous = NORMAL`, and
  `foreign_keys = ON`. Persistent lock contention still surfaces as a clear
  worker error; no hidden application retry loop is added in this slice.
- SQLite schema creation must go through a real migration runner:
  `CURRENT_RUNTIME_SCHEMA_VERSION = 1`, v1 recorded in `schema_migrations`,
  idempotent reopen, and non-retryable `runtime-v2-schema-too-new` for newer DBs.
- `GET /api/v2/workspaces` is included so reload/restart smoke can inspect persisted v2 workspace state.
- `DELETE /api/v2/workspaces/:workspaceId` is included only as authenticated v2
  smoke cleanup. Storage deletes the workspace and returns the deleted
  workspace's terminal sessions from inside the same transaction. Supervisor uses
  only that returned list, closes any attached v2 WebSocket subscribers for those
  sessions with code `1000` and reason `Workspace deleted`, waits for any
  already-sent in-flight attach attempt for that session to settle, then kills
  those v2 tmux sessions best-effort. This wait is bounded by the existing
  WorkerClient command timeout; the first slice does not add IPC cancellation.
  If Storage deletion fails, subscriber close and tmux kill must not run. If
  Storage returns `{ deleted: false, sessions: [] }`,
  treat the cleanup delete as idempotent success and do not close subscribers or
  kill tmux sessions. If tmux kill fails after Storage deletion, return the
  failure in `failedKills`. If a returned session has an invalid or unsafe
  `sessionName`, skip subscriber close and tmux kill for that raw value and
  include it in `failedKills`; unsafe names must never be sent to Terminal
  Worker. The `storage.delete-workspace` reply intentionally returns raw string
  session names so IPC reply validation does not discard corrupt cleanup rows
  before Supervisor can classify them into `failedKills`; attach/auth paths keep
  strict runtime session-name validation. Storage includes only
  `pending_terminal` and `ready` tabs in delete cleanup sessions; `failed` tabs
  are considered already reconciled and are not killed again. Leave orphan
  scan/reconciliation to a later Terminal Worker hardening plan.
- `storage.delete-workspace` checks that the workspace exists before selecting
  cleanup sessions. If the workspace is missing, it returns
  `{ deleted: false, sessions: [] }` immediately and does not let orphan tab rows
  for that workspace id become cleanup targets.
- v2 API and v2 terminal WebSocket use the existing authenticated app surface.
  HTTP continues to accept session cookie or `x-cmux-token` header. The v2 WebSocket
  upgrade accepts session cookie or `x-cmux-token`, but browser/Electron/Android
  WebView clients must rely on the session cookie because they cannot set custom
  WebSocket headers. Only the Node smoke script uses the `x-cmux-token` header.
  Token query parameters are forbidden on both HTTP v2 APIs and the v2 WebSocket.
  The query credential denylist is case-insensitive: `token`, `x-cmux-token`,
  `authorization`, `auth`, `api_key`, `apikey`, `access_token`, and
  `session-token`. The terminal WebSocket `session` query parameter remains
  allowed because it identifies the terminal session, not auth, but it must
  appear exactly once; missing, empty, or duplicated `session` parameters return
  `400 invalid-runtime-v2-terminal-session`. Malformed
  request URLs fail closed as authentication failures rather than surfacing as
  500s.
- Runtime v2 HTTP routes check `CODEXMUX_RUNTIME_V2` before auth, method
  validation, request parsing, or Supervisor access. Disabled routes return
  `404 runtime-v2-disabled` even for unauthenticated requests, and auth helpers
  are not called in that state.
- `/api/v2/terminal` WebSocket upgrade checks `CODEXMUX_RUNTIME_V2` before
  runtime v2 WebSocket auth, generic WebSocket auth, session parsing, or
  `handleUpgrade()`. Disabled upgrades return `404 runtime-v2-disabled`, and
  auth helpers are not called in that state. Disabled, unauthorized, and invalid
  session upgrade failures all use `writeUpgradeJsonError()` with
  `Content-Type: application/json`, exact `Content-Length`, and
  `Connection: close`. The raw response uses `\r\n\r\n` between headers and JSON
  body. `writeUpgradeJsonError()` closes with
  `socket.end(response)` and only falls back to `safeDestroySocket()` if
  `end()` throws; `safeDestroySocket()` also swallows destroy failures. Dev and prod upgrade handlers are built by
  `createWebSocketUpgradeHandler()` from
  `src/lib/runtime/server-ws-upgrade.ts`; v2 terminal
  disabled/auth/session/error logic still lives only in `routeWebSocketUpgrade()`.
  The exported function option types, `IRouteWebSocketUpgradeOptions` and
  `ICreateWebSocketUpgradeHandlerOptions`, are also exported so tests and
  `server.ts` wiring can type injected fixtures without reaching into private
  implementation details.
  `safeDestroySocket()` is an internal implementation detail and is not
  exported; tests verify its behavior only through public
  `routeWebSocketUpgrade()` and `createWebSocketUpgradeHandler()` outcomes.
  `getSingleSearchParam()` is also private and behavior-only; tests cover
  missing, empty, and duplicated query outcomes through the public upgrade
  router instead of asserting helper-level duplicate-vs-missing reasons.
  `createWebSocketUpgradeHandler()` wraps the whole returned listener in a
  top-level `try/catch`, including remote-address checks and `rejectSocket()`.
  Unexpected exceptions call the injected `onUpgradeError` inside its own
  best-effort `try/catch`, then fail-close with `safeDestroySocket()`;
  logging or destroy failures must not prevent cleanup attempts or reject the
  upgrade listener promise. The top-level catch does not try to write a JSON
  error because upgrade processing may already have partially started.
  Missing, empty, non-origin-form, raw non-ASCII/control/space/hash-containing,
  malformed percent-encoding, encoded path delimiters, or malformed WebSocket
  request URLs return `400 invalid-websocket-url` before runtime/generic auth,
  `handleUpgrade()`, or fallback proxying. Runtime v2 WebSocket namespace paths,
  including the bare `/api/v2` path, other than
  `/api/v2/terminal` return `404 runtime-v2-upgrade-not-found` before
  runtime/generic auth, known upgrade handling, or fallback proxying.
  `routeWebSocketUpgrade()` is the only upgrade path that parses `request.url`;
  it owns v2 terminal query dimension parsing, passes the parsed legacy `URL` to
  injected known-route callbacks, and passes a parsed v2 terminal context to the
  injected v2 terminal callback. Runtime or generic
  WebSocket auth verifier exceptions are handled through the same
  `writeUpgradeJsonError()` path as other unauthorized upgrades: they return
  `401 Unauthorized` JSON with `socket.end(response)` and only call
  `safeDestroySocket()` if `end()` throws.
- `scripts/smoke-runtime-v2.mjs` is required and must verify health, workspace create/list, tab create, v2 terminal WebSocket attach, stdin, stdout, resize, and cleanup.
- Docs updates include `docs/TMUX.md` and `docs/STATUS.md` in addition to `docs/ARCHITECTURE-LOGIC.md`, `docs/DATA-DIR.md`, and `docs/ADR.md`.

## File Structure

Create these files:

- `src/lib/runtime/ipc.ts` - shared typed IPC envelope schemas, first-slice command payload/reply and event registries, validation helpers, and command/reply/event constructors.
- `src/lib/runtime/worker-command-validation.ts` - shared worker-side command envelope validation for source, target, registered type, and namespace.
- `src/lib/runtime/session-name.ts` - runtime v2 tmux session-name/id helper with strict `rtv2-` validation and generation.
- `src/lib/runtime/contracts.ts` - shared runtime v2 DTO types used across Storage Worker, Supervisor, API routes, UI, and smoke script.
- `src/lib/runtime/worker-client.ts` - Supervisor-side worker process client with request/reply correlation, timeout, readiness, bounded restart/backoff, pending request overload protection, structured failed-reply preservation, retryable crash errors, and shutdown.
- `src/lib/runtime/worker-paths.ts` - dev/web/Electron worker script and runtime tmux config resolution for forked worker entrypoints.
- `src/lib/runtime/storage/schema.ts` - SQLite schema SQL, migrations, and database opening options.
- `src/lib/runtime/storage/repository.ts` - focused SQLite operations for workspaces, panes, tabs, status, and event log rows.
- `src/lib/runtime/storage/worker-service.ts` - pure Storage Worker command handler used by process entrypoint and unit tests.
- `src/lib/runtime/terminal/terminal-worker-runtime.ts` - Terminal Worker runtime wrapper around tmux lifecycle commands and node-pty attach sessions for the v2 terminal byte path.
- `src/lib/runtime/terminal/terminal-worker-service.ts` - pure Terminal Worker command handler used by process entrypoint and tests, including attach/detach/stdin/stdout/resize events.
- `src/lib/runtime/terminal-ws.ts` - testable v2 terminal WebSocket connection handler that decodes binary protocol frames and calls Supervisor terminal methods.
- `src/lib/runtime/server-ws-upgrade.ts` - shared, side-effect-light WebSocket upgrade router for v2 terminal disabled/auth/session/dimension/error policy.
- `src/lib/runtime/supervisor.ts` - `globalThis`-backed singleton Supervisor with shared `ensureStarted()`/startPromise, worker lifecycle, and API route command/query methods.
- `src/lib/runtime/api-auth.ts` - shared runtime v2 HTTP/WebSocket auth helper that accepts session cookie or `x-cmux-token` header and rejects query-string credentials.
- `src/lib/runtime/api-handler.ts` - shared runtime v2 API parsing and error-response helpers.
- `src/workers/storage-worker.ts` - Storage Worker process entrypoint.
- `src/workers/terminal-worker.ts` - Terminal Worker process entrypoint.
- `src/pages/api/v2/runtime/health.ts` - runtime v2 health endpoint.
- `src/pages/api/v2/workspaces/index.ts` - runtime v2 workspace list/create endpoint.
- `src/pages/api/v2/workspaces/[workspaceId]/index.ts` - runtime v2 workspace cleanup endpoint.
- `src/pages/api/v2/workspaces/[workspaceId]/layout.ts` - runtime v2 layout projection endpoint.
- `src/pages/api/v2/tabs/index.ts` - runtime v2 tab create endpoint.
- `scripts/smoke-runtime-v2.mjs` - automated v2 runtime smoke covering health, workspace/tab, terminal WS attach, stdin/stdout, resize, and cleanup.
- `scripts/verify-runtime-native-bindings.mjs` - verifies standalone/Electron native module availability for `node-pty` and optional `better-sqlite3`.
- `src/pages/experimental/runtime.tsx` - authenticated minimal runtime v2 page.
- `src/lib/message-namespaces.ts` - Add the `runtime` message namespace to the SSR/client locale loader list.
- `messages/ko/runtime.json` and `messages/en/runtime.json` - Korean/English visible copy for the runtime v2 experimental page.
- `tests/unit/lib/runtime/ipc.test.ts` - IPC schema tests.
- `tests/unit/lib/runtime/session-name.test.ts` - tmux-safe runtime session-name generation and rejection tests.
- `tests/unit/lib/runtime/worker-paths.test.ts` - worker script resolution tests for dev, web production, and packaged Electron.
- `tests/unit/lib/runtime/worker-client.test.ts` - worker client correlation, timeout, late-reply-ignore, and restart tests with a fake child process.
- `tests/unit/lib/runtime/storage-repository.test.ts` - SQLite schema and repository tests.
- `tests/unit/lib/runtime/storage-worker-service.test.ts` - Storage Worker command tests.
- `tests/unit/lib/runtime/terminal-worker-service.test.ts` - Terminal Worker command tests with a fake terminal runtime.
- `tests/unit/lib/runtime/terminal-worker-runtime.test.ts` - Terminal Worker runtime wrapper tests for tmux config source failure mapping and attach-time tmux session existence checks.
- `tests/integration/runtime-v2-terminal-process.test.ts` - process-level real tmux/node-pty Terminal Worker runtime test for create/attach/stdin/stdout/resize/kill.
- `tests/unit/lib/runtime/terminal-ws.test.ts` - v2 terminal WebSocket handler tests for stdin, resize, heartbeat, kill, detach, and attach failure.
- `tests/unit/lib/runtime/server-ws-upgrade.test.ts` - shared `routeWebSocketUpgrade()` and `createWebSocketUpgradeHandler()` tests for v2 terminal disabled/auth/session/error routing and upgrade-handler wiring without importing `server.ts`.
- `tests/unit/lib/runtime/supervisor.test.ts` - Supervisor orchestration tests for readiness, pending-intent tab creation, orphan cleanup, and terminal event fanout.
- `tests/unit/lib/runtime/api-auth.test.ts` - runtime v2 API auth helper tests.
- `tests/unit/lib/runtime/api-handler.test.ts` - runtime v2 API validation/error mapping tests.
- `tests/unit/pages/runtime-v2-api.test.ts` - route-level runtime v2 API auth, disabled, validation, cleanup, success, retryable worker failure, and non-retryable domain error preservation tests.
- `docs/superpowers/plans/2026-05-02-runtime-architecture-redesign.md` - this plan.

Modify these files:

- `package.json` - add SQLite dependency and runtime native verification script.
- `tsup.config.ts` - build worker entrypoints and externalize native SQLite.
- `server.ts` - initialize runtime v2 Supervisor only when `CODEXMUX_RUNTIME_V2=1`, import the shared WebSocket upgrade handler factory, route `/api/v2/terminal` WebSocket upgrades, and accept session cookie or `x-cmux-token` header for v2 terminal WS auth while rejecting query-string credentials.
- `docs/ARCHITECTURE-LOGIC.md` - add experimental runtime v2 note.
- `docs/DATA-DIR.md` - document `runtime-v2/state.db` as experimental state.
- `docs/ADR.md` - add proposed ADR entries for worker runtime, SQLite state, typed IPC, and ephemeral terminal streams.
- `docs/TMUX.md` - document `/api/v2/terminal` as the experimental Terminal Worker-owned WebSocket path.
- `docs/STATUS.md` - document the experimental SQLite `tab_status` foundation and clarify that production status remains on the current StatusManager until the later Status Worker plan.

Do not refactor `src/components/ui/` or `src/components/ai-elements/`.

## Spec Coverage Map

This plan covers the approved blueprint's first executable slice:

| Spec Requirement | Covered In This Plan |
| --- | --- |
| Typed Node IPC | Tasks 2 and 3 |
| Supervisor starts and restarts ready worker processes | Tasks 3 and 8 |
| SQLite Storage Worker foundation | Tasks 4 and 5 |
| Terminal Worker lifecycle and v2 byte-path ownership | Tasks 6, 7, 9, and 12 |
| API v2 adapter pattern | Tasks 9 and 10 |
| Minimal UI route for runtime v2 smoke | Task 10 |
| Experimental docs and ADR proposals | Task 11 |
| Verification gate before production replacement | Task 12 |

The approved design also requires production-grade Terminal Worker hardening,
full Storage command coverage, Timeline Worker, Status Worker, and complete
platform smoke automation. Those are follow-up plans listed at the end of this
document. This plan proves the minimum worker-owned terminal byte path but does
not claim the runtime is ready to replace production.

## Design Plan Review Notes

Classifier: APP UI. The runtime v2 page is an operational diagnostic surface,
not a marketing page and not a replacement workspace UI.

### What Already Exists

- `DESIGN.md` defines codexmux as a Codex-focused web session manager, not a
  general terminal dashboard.
- `docs/STYLE.md` requires calm enterprise SaaS surfaces, muted tokens, thin
  borders, dense layouts, shadcn/ui controls, lucide icons, and no decorative
  gradients/cards/heroes.
- `getPageShellLayout` already provides the desktop sidebar and mobile shell.
- Existing terminal/workspace surfaces use `ContentHeader`, `PaneLayout`,
  shadcn `Button`, `Spinner`, `AlertTriangle`, `RefreshCw`, and compact
  bordered states.
- Korean-first SSR locale hydration is already handled by loading message
  bundles in server-rendered pages.

### Not In Scope

- No sidebar entry or primary navigation promotion for `/experimental/runtime`
  in this slice. It remains URL-only during the experiment.
- No marketing hero, onboarding copy, or product education. This page is for
  proving runtime behavior.
- No full xterm replacement UI. The page only needs a compact stdout smoke
  surface for attach/input/output validation.
- No visual redesign of the production workspace.
- No new mobile-specific terminal product feature work. The experimental page
  still supports the full smoke flow on mobile through a compact diagnostic
  layout: health, workspace list/create, tab create, v2 attach, stdin, stdout,
  resize-safe rendering, and reconnect/error display.

### Experimental Page Information Architecture

Desktop layout:

```text
PageShell
└─ Runtime V2 diagnostic page
   ├─ Header row
   │  ├─ Title: Runtime V2
   │  ├─ Runtime badge: disabled / ready / degraded
   │  └─ Actions: Refresh, Create workspace, Create tab, Attach
   ├─ Two-column work area
   │  ├─ Left: v2 workspaces and selected layout projection
   │  └─ Right: terminal smoke panel
   │     ├─ connection state
   │     ├─ stdin command row
   │     └─ stdout pre
   └─ Bottom diagnostic JSON/details strip
```

Mobile layout:

```text
Runtime V2 diagnostic page
├─ Header + status
├─ Primary actions in a two-column grid: Refresh/Create workspace on row 1, Create tab/Attach on row 2
├─ Workspaces/layout section
├─ Terminal smoke section
└─ Collapsible diagnostic JSON/details
```

Mobile must support the same smoke journey as desktop. It can compress sections
vertically, but it must not replace terminal attach/stdout with a desktop-only
message.

The first thing the user sees is whether runtime v2 is available. The second is
what workspace/tab state exists. The third is whether the v2 terminal byte path
actually works.

### Interaction State Coverage

| Feature | Loading | Empty | Error | Success | Partial |
| --- | --- | --- | --- | --- | --- |
| Runtime health | Small spinner beside status text | `Runtime v2 is disabled` with no create actions | Inline amber error with retry button | `Ready` badge | `Degraded` badge if one worker is unavailable |
| Workspace list | Skeleton row or spinner | `No v2 workspaces yet` plus create button | Inline retry surface | Selected workspace row and layout summary | Existing workspaces load but selected layout fails |
| Create workspace | Button pending state | Same as workspace empty | Toast plus inline message | New workspace selected | Workspace created but layout fetch pending |
| Create tab | Disabled until workspace selected | `Select or create a workspace first` | Toast plus inline message | Tab appears in layout summary | Pending tab intent exists while terminal create/finalize is in progress |
| Terminal attach | Connecting text and spinner | `Create a tab to attach` | Socket close reason and retry button | Connected badge | Attached but no output yet |
| Terminal stdin/stdout | Command button pending | Empty stdout pre with muted empty-state text | Inline terminal error | Stdout shows command output | Output received while resize/heartbeat status is unknown |
| Diagnostic JSON | Collapsed by default on mobile | No data message | Shows last failed payload | Shows latest health/workspace/layout/tab payloads | Shows available payloads and names missing ones |

### User Journey

| Step | User does | User feels | Plan specifies? |
| --- | --- | --- | --- |
| 1 | Opens `/experimental/runtime` | Wants to know if v2 is alive | Health badge and disabled-state copy |
| 2 | Creates or selects a v2 workspace | Wants fast confirmation | Selected workspace row and layout JSON |
| 3 | Creates a terminal tab | Wants proof a real tmux session exists | Tab summary with `rtv2-ws-...` session name |
| 4 | Attaches terminal and sends `pwd` | Wants proof bytes moved through v2 | Terminal smoke panel shows stdout |
| 5 | Reloads the page | Wants state to still be there | `GET /api/v2/workspaces` reload path |
| 6 | Hits an error | Wants a concrete next action | Retry buttons and close/error reason text |

Time horizon:

- 5 seconds: user sees runtime state and the next available action.
- 5 minutes: user can repeat workspace/tab/terminal smoke without reading code.
- 5 years: this page remains a narrow diagnostic tool, not a second product UI.

### Specific UI Rules For Task 10

- Use shadcn `Button` instead of raw `<button>` styling.
- Use lucide icons exactly: `RefreshCw` for refresh, `Plus` for workspace
  creation, `Terminal` for tab creation, `PlugZap` for terminal attach, and
  `AlertTriangle` for inline runtime errors.
- Use app tokens only: `bg-background`, `bg-muted`, `border-border`,
  `text-muted-foreground`, `text-ui-amber`, `text-ui-teal`.
- Keep cards earned: one bordered surface for workspace/layout, one bordered
  surface for terminal smoke, one compact diagnostic JSON area. Do not nest cards.
- Use `text-sm` and `text-xs` for diagnostic density. No hero-scale type.
- Preserve Korean/English messages through SSR hydration. Copy may be terse, but
  messages must be added in both locales if user-facing.
- Body text must keep Korean `word-break: keep-all`; terminal stdout and JSON
  remain `font-mono`/`pre` exceptions.
- Mobile interactive controls must use `min-h-11` or a 44px-tall clickable row.
  Dense text links inside the diagnostic JSON area must sit inside a 44px row
  wrapper. Keep `active` and `focus-visible` states inherited from shadcn
  controls.
- The terminal smoke output must not obscure actions or resize the layout
  unpredictably. Use a fixed min/max height with overflow.

### Design Review Scorecard

| Pass | Initial | After plan fixes | Notes |
| --- | ---: | ---: | --- |
| Information Architecture | 5/10 | 8/10 | Added diagnostic-first hierarchy and desktop/mobile structure. |
| Interaction States | 4/10 | 8/10 | Added loading/empty/error/success/partial table. |
| User Journey | 5/10 | 8/10 | Added smoke journey and time-horizon behavior. |
| AI Slop Risk | 7/10 | 9/10 | Classified as app UI and banned hero/card/gradient drift. |
| Design System Alignment | 6/10 | 8/10 | Tied page to `DESIGN.md`, `docs/STYLE.md`, shadcn, lucide, tokens. |
| Responsive & Accessibility | 5/10 | 9/10 | Mobile supports full compact smoke, touch target, focus, overflow constraints. |
| Unresolved Design Decisions | 7/10 | 9/10 | URL-only discoverability is resolved for this slice. |

## Task 1: Dependencies And Build Entries

**Files:**
- Modify: `package.json`
- Modify: `tsup.config.ts`
- Modify: `scripts/post-build.js`
- Create: `scripts/verify-runtime-native-bindings.mjs`

- [ ] **Step 1: Add SQLite dependencies**

Run:

```bash
corepack pnpm add -O better-sqlite3
corepack pnpm add -D @types/better-sqlite3
```

Expected: `package.json` and `pnpm-lock.yaml` include `better-sqlite3` under
`optionalDependencies` and `@types/better-sqlite3` under `devDependencies`.
Runtime v2 off installs/builds must not require the native SQLite binding to
load.

- [ ] **Step 1a: Allow native SQLite builds in pnpm**

Update `package.json#pnpm.onlyBuiltDependencies`:

```json
"onlyBuiltDependencies": [
  "better-sqlite3",
  "electron",
  "node-pty"
]
```

Expected: pnpm is allowed to build both `node-pty` and optional
`better-sqlite3` native bindings during install. If optional SQLite build is
unavailable, normal runtime v2 off install/build still succeeds; runtime v2 on
reports `runtime-v2-sqlite-unavailable`.

- [ ] **Step 2: Update `tsup.config.ts` to build worker entrypoints**

Patch the existing config instead of replacing the whole file. Preserve existing
options, plugins, aliases, and package externals. Add the two worker entrypoints
and ensure native modules remain external:

```ts
entry: {
  ...existingEntries,
  'workers/storage-worker': 'src/workers/storage-worker.ts',
  'workers/terminal-worker': 'src/workers/terminal-worker.ts',
},
external: [...existingExternals, 'better-sqlite3', 'node-pty'],
```

Expected: the diff only adds worker entries and required native externals; it
does not discard unrelated existing `tsup` settings.

- [ ] **Step 2a: Keep native modules available in Electron standalone output**

Update `scripts/post-build.js` so Electron mode copies optional
`better-sqlite3` and its transitive runtime dependencies into
`.next/standalone/node_modules` when the package is installed. Keep existing
dynamic package handling for pino packages and do not fail runtime v2 off builds
when the optional SQLite package is absent:

Also ensure `src/config/tmux.conf` is copied into
`.next/standalone/src/config/tmux.conf` in both web and Electron modes:

```js
const copies = [
  { src: path.join(root, 'public'), dest: path.join(standalone, 'public') },
  { src: path.join(root, '.next', 'static'), dest: path.join(standalone, '.next', 'static') },
  { src: path.join(root, 'src', 'config', 'tmux.conf'), dest: path.join(standalone, 'src', 'config', 'tmux.conf') },
];
```

Update the copy loop to create destination parent directories before `fs.cpSync`
so file copies into nested standalone paths work:

```js
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.cpSync(src, dest, { recursive: true });
```

```js
const dynamicPackages = ['pino-roll', 'pino-pretty', 'better-sqlite3'];
```

Expected: Electron runtime v2 packaging includes the native SQLite binding when
the optional dependency is installed, alongside the existing native `node-pty`
dependency, and both web/npm and Electron standalone outputs include
`src/config/tmux.conf`. A runtime v2 off build must not fail if the optional
package is absent.

- [ ] **Step 2b: Add standalone native binding verification**

Add `scripts/verify-runtime-native-bindings.mjs` and a package script:

```json
"verify:runtime-native": "node scripts/verify-runtime-native-bindings.mjs"
```

The script must:

- locate `.next/standalone/node_modules`
- verify `node-pty` resolves from that standalone module tree
- verify the resolved `node-pty` package contains a native `.node` binding or a
  platform prebuild used by the installed package
- verify `better-sqlite3` resolves and has a native `.node` binding when it is
  installed, or when `CODEXMUX_RUNTIME_V2=1`
- skip missing `better-sqlite3` only when runtime v2 is off
- fail with `runtime-v2-sqlite-unavailable` when `CODEXMUX_RUNTIME_V2=1` and
  `better-sqlite3` is missing from standalone output
- verify Electron mode uses `__CMUX_APP_DIR_UNPACKED`/`app.asar.unpacked`
  assumptions by checking the worker output path and native packages are outside
  `app.asar`
- verify `.next/standalone/src/config/tmux.conf` exists and, in Electron mode,
  corresponds to the packaged `app.asar.unpacked/src/config/tmux.conf` runtime
  path
- print a concise JSON summary of checked packages and resolved binding paths

Expected: after `corepack pnpm build:electron`, the script proves the packaged
runtime can resolve `node-pty` and, with `CODEXMUX_RUNTIME_V2=1`,
`better-sqlite3`, worker files, and `src/config/tmux.conf` from the same
standalone/Electron layout the Supervisor uses. If Electron ABI rebuild, unpack
handling, or tmux config copying is broken, the script fails before any manual
Electron smoke is considered valid.

- [ ] **Step 3: Run the build config check**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: it may fail because worker files do not exist yet. The expected failure mentions missing `src/workers/storage-worker.ts` or `src/workers/terminal-worker.ts`, not syntax errors in `tsup.config.ts` or package JSON errors.

- [ ] **Step 4: Record checkpoint**

Record changed files and the build config check result. Do not commit unless the
user explicitly asks.

## Task 2: Typed IPC Contract

**Files:**
- Create: `src/lib/runtime/contracts.ts`
- Create: `src/lib/runtime/ipc.ts`
- Create: `src/lib/runtime/worker-command-validation.ts`
- Create: `tests/unit/lib/runtime/ipc.test.ts`
- Create: `tests/unit/lib/runtime/worker-command-validation.test.ts`

- [ ] **Step 1: Add shared runtime v2 contracts**

Create `src/lib/runtime/contracts.ts`:

```ts
import type { ILayoutData } from '@/types/terminal';

export interface IRuntimeHealth {
  ok: boolean;
  storage: unknown;
  terminal: unknown;
}

export interface IRuntimeWorkspace {
  id: string;
  name: string;
  defaultCwd: string;
  active: boolean | number;
  groupId?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface IRuntimeCreateWorkspaceResult {
  id: string;
  rootPaneId: string;
}

export interface IRuntimeWorkspaceList {
  workspaces: IRuntimeWorkspace[];
}

export interface IRuntimeWorkspaceTerminalSession {
  sessionName: string;
}

export interface IRuntimeDeleteWorkspaceStorageResult {
  deleted: boolean;
  sessions: IRuntimeWorkspaceTerminalSession[];
}

export interface IRuntimeDeleteWorkspaceResult {
  deleted: boolean;
  killedSessions: string[];
  failedKills: Array<{ sessionName: string; error: string }>;
}

export interface IRuntimeTerminalTab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  cwd?: string;
  panelType: 'terminal';
  lifecycleState: 'pending_terminal' | 'ready' | 'failed';
}

export interface IRuntimePendingTerminalTab {
  id: string;
  sessionName: string;
  workspaceId: string;
  paneId: string;
  cwd: string;
  lifecycleState: 'pending_terminal';
  createdAt: string;
}

export type TRuntimeLayout = ILayoutData | null;
```

- [ ] **Step 2: Write the failing IPC tests**

Create `tests/unit/lib/runtime/ipc.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createRuntimeCommand,
  createRuntimeEvent,
  createRuntimeReply,
  parseRuntimeCommandPayload,
  parseRuntimeEventPayload,
  parseRuntimeMessage,
  parseRuntimeReplyPayload,
  runtimeCommandRegistry,
  runtimeEventRegistry,
} from '@/lib/runtime/ipc';

describe('runtime ipc', () => {
  it('creates and parses command envelopes', () => {
    const msg = createRuntimeCommand({
      id: 'cmd-1',
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: { ping: true },
    });

    expect(parseRuntimeMessage(msg)).toEqual(msg);
    expect(msg.kind).toBe('command');
    expect(msg.sentAt).toMatch(/T/);
  });

  it('creates reply envelopes linked to commands', () => {
    const reply = createRuntimeReply({
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      error: { code: 'storage-unavailable', message: 'database locked', retryable: true },
      payload: null,
    });

    expect(reply.kind).toBe('reply');
    expect(reply.commandId).toBe('cmd-1');
    expect(reply.error?.retryable).toBe(true);
  });

  it('rejects malformed envelopes', () => {
    expect(() => parseRuntimeMessage({ kind: 'command', id: 'x' })).toThrow(/Invalid runtime IPC message/);
  });

  it('rejects reply envelopes with invalid success or failure shape', () => {
    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    })).toThrow(/Invalid runtime IPC message/);

    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-2',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: false,
      payload: null,
    })).toThrow(/Invalid runtime IPC message/);

    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-3',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: false,
      error: { code: 'storage-unavailable', message: 'database locked' },
      payload: { ok: false },
    })).toThrow(/Invalid runtime IPC message/);
  });

  it('validates reply constructors before returning', () => {
    expect(() => createRuntimeReply({
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    } as never)).toThrow(/Invalid runtime IPC message/);

    expect(() => createRuntimeReply({
      id: 'reply-2',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
    } as never)).toThrow(/Invalid runtime IPC message/);

    expect(() => createRuntimeReply({
      id: 'reply-3',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-workspace.reply',
      ok: true,
      payload: { id: 'ws-a' },
    })).toThrow(/Invalid runtime IPC reply/);
  });

  it('distinguishes durable and realtime events', () => {
    const event = createRuntimeEvent({
      id: 'evt-1',
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'hello' },
    });

    expect(event.kind).toBe('event');
    expect(event.delivery).toBe('realtime');
  });

  it('validates event payloads through the event registry', () => {
    expect(runtimeEventRegistry['terminal.stdout']).toMatchObject({
      source: 'terminal',
      target: 'supervisor',
      delivery: 'realtime',
    });

    const payload = parseRuntimeEventPayload('terminal.stdout', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      data: 'hello',
    });

    expect(payload).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      data: 'hello',
    });
    expect(() => parseRuntimeEventPayload('terminal.stdout', {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      data: 'hello',
    })).toThrow(/Invalid runtime IPC event/);

    expect(runtimeEventRegistry['terminal.backpressure']).toMatchObject({
      source: 'terminal',
      target: 'supervisor',
      delivery: 'realtime',
    });

    const backpressure = parseRuntimeEventPayload('terminal.backpressure', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: 4096,
      maxPendingStdoutBytes: 2048,
    });

    expect(backpressure).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: 4096,
      maxPendingStdoutBytes: 2048,
    });
    expect(() => parseRuntimeEventPayload('terminal.backpressure', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: -1,
      maxPendingStdoutBytes: 2048,
    })).toThrow(/Invalid runtime IPC event/);
  });

  it('validates registered event constructors before returning', () => {
    expect(() => createRuntimeEvent({
      id: 'evt-1',
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'pt-ws-a-pane-b-tab-c', data: 'hello' },
    })).toThrow(/Invalid runtime IPC event/);

    expect(() => createRuntimeEvent({
      id: 'evt-2',
      source: 'storage',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'hello' },
    })).toThrow(/Invalid runtime IPC event/);
  });

  it('validates command payloads through the command registry', () => {
    expect(runtimeCommandRegistry['storage.delete-workspace']).toBeDefined();

    const payload = parseRuntimeCommandPayload('terminal.resize', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    });

    expect(payload).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    });
    expect(() => parseRuntimeCommandPayload('terminal.resize', {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    })).toThrow(/Invalid runtime IPC payload/);

    for (const oversized of [
      { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 501, rows: 30 },
      { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 100, rows: 201 },
    ]) {
      expect(() => parseRuntimeCommandPayload('terminal.resize', oversized)).toThrow(/Invalid runtime IPC payload/);
      expect(() => parseRuntimeCommandPayload('terminal.attach', oversized)).toThrow(/Invalid runtime IPC payload/);
      expect(() => parseRuntimeCommandPayload('terminal.create-session', { ...oversized, cwd: '/tmp' })).toThrow(/Invalid runtime IPC payload/);
    }
  });

  it('rejects tmux-unsafe runtime session names', () => {
    for (const sessionName of [
      'rtv2-ws-a:pane-b-tab-c',
      'rtv2-ws-a pane-b-tab-c',
      'rtv2-ws-a/pane-b-tab-c',
      'rtv2-Ws-a-pane-b-tab-c',
      `rtv2-${'a'.repeat(200)}`,
    ]) {
      expect(() => parseRuntimeCommandPayload('terminal.attach', {
        sessionName,
        cols: 80,
        rows: 24,
      })).toThrow(/Invalid runtime IPC payload/);
    }
  });

  it('validates reply payloads through the command registry', () => {
    expect(parseRuntimeReplyPayload('storage.create-workspace', {
      id: 'ws-a',
      rootPaneId: 'pane-a',
    })).toEqual({ id: 'ws-a', rootPaneId: 'pane-a' });

    expect(() => parseRuntimeReplyPayload('storage.create-workspace', {
      id: 'ws-a',
    })).toThrow(/Invalid runtime IPC reply/);
  });
});
```

Create `tests/unit/lib/runtime/session-name.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  createRuntimeId,
  createRuntimeSessionName,
  parseRuntimeSessionName,
} from '@/lib/runtime/session-name';

describe('runtime session names', () => {
  it('generates tmux-safe bounded v2 session names', () => {
    const workspaceId = createRuntimeId('ws');
    const paneId = createRuntimeId('pane');
    const tabId = createRuntimeId('tab');
    const sessionName = createRuntimeSessionName({ workspaceId, paneId, tabId });

    expect(sessionName).toMatch(/^rtv2-[a-z0-9][a-z0-9-]*$/);
    expect(Buffer.byteLength(sessionName)).toBeLessThanOrEqual(120);
  });

  it('rejects unsafe or too-long existing session names', () => {
    for (const sessionName of [
      'pt-ws-a-pane-b-tab-c',
      'rtv2-ws-a:pane-b-tab-c',
      'rtv2-ws-a pane-b-tab-c',
      'rtv2-ws-a/pane-b-tab-c',
      'rtv2-Ws-a-pane-b-tab-c',
      `rtv2-${'a'.repeat(200)}`,
    ]) {
      expect(() => parseRuntimeSessionName(sessionName)).toThrow();
    }
  });
});
```

- [ ] **Step 3: Run the failing tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/session-name.test.ts
```

Expected: FAIL with missing runtime IPC/session-name modules.

- [ ] **Step 4: Implement `src/lib/runtime/ipc.ts`**

Create `src/lib/runtime/session-name.ts`:

```ts
import { customAlphabet } from 'nanoid';
import { z } from 'zod';

export const RUNTIME_SESSION_PREFIX = 'rtv2-';
export const RUNTIME_SESSION_NAME_MAX_LENGTH = 120;

const runtimeSafeId = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

export const runtimeSessionNameSchema = z.string()
  .min(RUNTIME_SESSION_PREFIX.length + 1)
  .max(RUNTIME_SESSION_NAME_MAX_LENGTH)
  .regex(
    /^rtv2-[a-z0-9][a-z0-9-]*$/,
    'runtime v2 terminal session names must be tmux-safe and start with rtv2-',
  );

export const createRuntimeId = (prefix: 'ws' | 'pane' | 'tab' | 'evt' | 'sub' | 'msg'): string =>
  `${prefix}-${runtimeSafeId()}`;

export const parseRuntimeSessionName = (sessionName: string): string =>
  runtimeSessionNameSchema.parse(sessionName);

export const createRuntimeSessionName = (input: {
  workspaceId: string;
  paneId: string;
  tabId: string;
}): string =>
  parseRuntimeSessionName(`${RUNTIME_SESSION_PREFIX}${input.workspaceId}-${input.paneId}-${input.tabId}`);
```

Create `src/lib/runtime/ipc.ts`:

```ts
import { nanoid } from 'nanoid';
import { z } from 'zod';
import { runtimeSessionNameSchema } from '@/lib/runtime/session-name';

const RUNTIME_TERMINAL_MAX_COLS = 500;
const RUNTIME_TERMINAL_MAX_ROWS = 200;
const emptyPayloadSchema = z.object({}).strict();
const runtimeHealthReplySchema = z.object({ ok: z.boolean() }).passthrough();
const runtimeWorkspaceSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultCwd: z.string(),
  active: z.union([z.boolean(), z.number()]),
  groupId: z.string().nullable().optional(),
  orderIndex: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
const runtimeCreateWorkspaceResultSchema = z.object({
  id: z.string(),
  rootPaneId: z.string(),
});
const runtimePendingTerminalTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  workspaceId: z.string(),
  paneId: z.string(),
  cwd: z.string(),
  lifecycleState: z.literal('pending_terminal'),
  createdAt: z.string(),
});
const runtimeTerminalTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  name: z.string(),
  order: z.number(),
  cwd: z.string().optional(),
  panelType: z.literal('terminal'),
  lifecycleState: z.union([z.literal('pending_terminal'), z.literal('ready'), z.literal('failed')]),
});
const runtimeTerminalSessionSchema = z.object({
  sessionName: runtimeSessionNameSchema,
});
const rawTerminalSessionSchema = z.object({
  sessionName: z.string(),
});
const runtimeDeleteWorkspaceStorageResultSchema = z.object({
  deleted: z.boolean(),
  sessions: z.array(rawTerminalSessionSchema),
});
const runtimeLayoutTabSchema = z.object({
  id: z.string(),
  sessionName: runtimeSessionNameSchema,
  name: z.string(),
  order: z.number(),
  title: z.string().optional(),
  cwd: z.string().optional(),
  panelType: z.union([
    z.literal('terminal'),
    z.literal('codex'),
    z.literal('web-browser'),
    z.literal('diff'),
  ]).optional(),
});
type TRuntimeLayoutNodeSchema = z.ZodType<{
  type: 'pane' | 'split';
  id?: string;
  tabs?: unknown[];
  activeTabId?: string | null;
  orientation?: 'horizontal' | 'vertical';
  ratio?: number;
  children?: unknown[];
}>;
const runtimeLayoutNodeSchema: TRuntimeLayoutNodeSchema = z.lazy(() => z.discriminatedUnion('type', [
  z.object({
    type: z.literal('pane'),
    id: z.string(),
    tabs: z.array(runtimeLayoutTabSchema),
    activeTabId: z.string().nullable(),
  }),
  z.object({
    type: z.literal('split'),
    orientation: z.union([z.literal('horizontal'), z.literal('vertical')]),
    ratio: z.number(),
    children: z.tuple([runtimeLayoutNodeSchema, runtimeLayoutNodeSchema]),
  }),
]));
const runtimeLayoutSchema = z.object({
  root: runtimeLayoutNodeSchema,
  activePaneId: z.string().nullable(),
  updatedAt: z.string(),
}).nullable();
const workspaceIdPayloadSchema = z.object({ workspaceId: z.string().min(1) });
const createWorkspacePayloadSchema = z.object({
  name: z.string().min(1),
  defaultCwd: z.string().min(1),
});
const createPendingTerminalTabPayloadSchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  paneId: z.string().min(1),
  sessionName: runtimeSessionNameSchema,
  cwd: z.string().min(1),
});
const tabIdPayloadSchema = z.object({ id: z.string().min(1) });
const failPendingTerminalTabPayloadSchema = z.object({
  id: z.string().min(1),
  reason: z.string().min(1),
});
const terminalCreatePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  cols: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_COLS),
  rows: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_ROWS),
  cwd: z.string().optional(),
});
const terminalResizePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  cols: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_COLS),
  rows: z.number().int().min(1).max(RUNTIME_TERMINAL_MAX_ROWS),
});
const terminalWritePayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  data: z.string(),
});
const terminalStdoutEventPayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  data: z.string(),
});
const terminalBackpressureEventPayloadSchema = z.object({
  sessionName: runtimeSessionNameSchema,
  pendingBytes: z.number().int().nonnegative(),
  maxPendingStdoutBytes: z.number().int().positive(),
});

export const runtimeCommandRegistry = {
  'storage.health': { payload: emptyPayloadSchema, reply: runtimeHealthReplySchema },
  'storage.create-workspace': { payload: createWorkspacePayloadSchema, reply: runtimeCreateWorkspaceResultSchema },
  'storage.create-pending-terminal-tab': { payload: createPendingTerminalTabPayloadSchema, reply: runtimePendingTerminalTabSchema },
  'storage.finalize-terminal-tab': { payload: tabIdPayloadSchema, reply: runtimeTerminalTabSchema },
  'storage.fail-pending-terminal-tab': { payload: failPendingTerminalTabPayloadSchema, reply: z.object({ ok: z.boolean() }) },
  'storage.list-pending-terminal-tabs': { payload: emptyPayloadSchema, reply: z.array(runtimePendingTerminalTabSchema) },
  'storage.get-ready-terminal-tab-by-session': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalTabSchema.nullable() },
  'storage.delete-workspace': { payload: workspaceIdPayloadSchema, reply: runtimeDeleteWorkspaceStorageResultSchema },
  'storage.list-workspaces': { payload: emptyPayloadSchema, reply: z.array(runtimeWorkspaceSchema) },
  'storage.get-layout': { payload: workspaceIdPayloadSchema, reply: runtimeLayoutSchema },
  'terminal.health': { payload: emptyPayloadSchema, reply: runtimeHealthReplySchema },
  'terminal.create-session': { payload: terminalCreatePayloadSchema, reply: runtimeTerminalSessionSchema },
  'terminal.attach': { payload: terminalResizePayloadSchema, reply: runtimeTerminalSessionSchema.extend({ attached: z.boolean() }) },
  'terminal.detach': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalSessionSchema.extend({ detached: z.boolean() }) },
  'terminal.kill-session': { payload: runtimeTerminalSessionSchema, reply: runtimeTerminalSessionSchema.extend({ killed: z.boolean() }) },
  'terminal.write-stdin': { payload: terminalWritePayloadSchema, reply: z.object({ written: z.number().int().nonnegative() }) },
  'terminal.write-web-stdin': { payload: terminalWritePayloadSchema, reply: z.object({ written: z.number().int().nonnegative() }) },
  'terminal.resize': { payload: terminalResizePayloadSchema, reply: terminalResizePayloadSchema },
} as const satisfies Record<string, { payload: z.ZodTypeAny; reply: z.ZodTypeAny }>;

export const runtimeEventRegistry = {
  'terminal.stdout': {
    source: 'terminal',
    target: 'supervisor',
    delivery: 'realtime',
    payload: terminalStdoutEventPayloadSchema,
  },
  'terminal.backpressure': {
    source: 'terminal',
    target: 'supervisor',
    delivery: 'realtime',
    payload: terminalBackpressureEventPayloadSchema,
  },
} as const satisfies Record<string, {
  source: string;
  target: string;
  delivery: 'realtime' | 'durable';
  payload: z.ZodTypeAny;
}>;

export type TRuntimeCommandType = keyof typeof runtimeCommandRegistry;
export type TRuntimeEventType = keyof typeof runtimeEventRegistry;
export type TRuntimeCommandPayload<TType extends TRuntimeCommandType> = z.infer<(typeof runtimeCommandRegistry)[TType]['payload']>;
export type TRuntimeCommandReplyPayload<TType extends TRuntimeCommandType> = z.infer<(typeof runtimeCommandRegistry)[TType]['reply']>;
export type TRuntimeEventPayload<TType extends TRuntimeEventType> = z.infer<(typeof runtimeEventRegistry)[TType]['payload']>;

const runtimeErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryable: z.boolean().optional(),
});

const baseEnvelopeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.string().min(1),
  sentAt: z.string().min(1),
  payload: z.unknown(),
});

const commandSchema = baseEnvelopeSchema.extend({
  kind: z.literal('command'),
});

const successReplySchema = baseEnvelopeSchema.extend({
  kind: z.literal('reply'),
  commandId: z.string().min(1),
  ok: z.literal(true),
}).strict();

const failedReplySchema = baseEnvelopeSchema.extend({
  kind: z.literal('reply'),
  commandId: z.string().min(1),
  ok: z.literal(false),
  payload: z.null(),
  error: runtimeErrorSchema,
}).strict();

const replySchema = z.discriminatedUnion('ok', [successReplySchema, failedReplySchema]);

const eventSchema = baseEnvelopeSchema.extend({
  kind: z.literal('event'),
  delivery: z.union([z.literal('realtime'), z.literal('durable')]),
});

const messageSchema = z.union([commandSchema, replySchema, eventSchema]);

export const isRuntimeCommandType = (type: string): type is TRuntimeCommandType =>
  type in runtimeCommandRegistry;

export const isRuntimeEventType = (type: string): type is TRuntimeEventType =>
  type in runtimeEventRegistry;

export const parseRuntimeCommandPayload = <TType extends TRuntimeCommandType>(
  type: TType,
  value: unknown,
): TRuntimeCommandPayload<TType> => {
  const parsed = runtimeCommandRegistry[type].payload.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC payload for ${type}: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  return parsed.data as TRuntimeCommandPayload<TType>;
};

export const parseRuntimeReplyPayload = <TType extends TRuntimeCommandType>(
  type: TType,
  value: unknown,
): TRuntimeCommandReplyPayload<TType> => {
  const parsed = runtimeCommandRegistry[type].reply.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC reply for ${type}: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  return parsed.data as TRuntimeCommandReplyPayload<TType>;
};

export const parseRuntimeEventPayload = <TType extends TRuntimeEventType>(
  type: TType,
  value: unknown,
): TRuntimeEventPayload<TType> => {
  const parsed = runtimeEventRegistry[type].payload.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC event for ${type}: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  return parsed.data as TRuntimeEventPayload<TType>;
};

export interface IRuntimeError {
  code: string;
  message: string;
  retryable?: boolean;
}

export interface IRuntimeEnvelope<TPayload = unknown> {
  id: string;
  source: string;
  target: string;
  type: string;
  sentAt: string;
  payload: TPayload;
}

export interface IRuntimeCommand<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'command';
}

export interface IRuntimeReply<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'reply';
  commandId: string;
  ok: boolean;
  error?: IRuntimeError;
}

export interface IRuntimeEvent<TPayload = unknown> extends IRuntimeEnvelope<TPayload> {
  kind: 'event';
  delivery: 'realtime' | 'durable';
}

export type TRuntimeMessage<TPayload = unknown> =
  | IRuntimeCommand<TPayload>
  | IRuntimeReply<TPayload>
  | IRuntimeEvent<TPayload>;

export interface ICreateCommandInput<TPayload> {
  id?: string;
  source: string;
  target: string;
  type: string;
  payload: TPayload;
}

export interface ICreateReplyBaseInput {
  id?: string;
  commandId: string;
  source: string;
  target: string;
  type: string;
}

export type TCreateReplyInput<TPayload = null> =
  | (ICreateReplyBaseInput & { ok: true; payload: TPayload; error?: never })
  | (ICreateReplyBaseInput & { ok: false; payload: null; error: IRuntimeError });

export interface ICreateEventInput<TPayload> {
  id?: string;
  source: string;
  target: string;
  type: string;
  delivery: 'realtime' | 'durable';
  payload: TPayload;
}

const nowIso = (): string => new Date().toISOString();
const nextId = (): string => `msg-${nanoid(10)}`;

export const createRuntimeCommand = <TPayload>(input: ICreateCommandInput<TPayload>): IRuntimeCommand<TPayload> => ({
  kind: 'command',
  id: input.id ?? nextId(),
  source: input.source,
  target: input.target,
  type: input.type,
  sentAt: nowIso(),
  payload: input.payload,
});

export const createRuntimeReply = <TPayload = null>(input: TCreateReplyInput<TPayload>): IRuntimeReply<TPayload> => {
  const msg = {
    kind: 'reply' as const,
    id: input.id ?? nextId(),
    commandId: input.commandId,
    source: input.source,
    target: input.target,
    type: input.type,
    sentAt: nowIso(),
    ok: input.ok,
    payload: input.payload,
    ...('error' in input ? { error: input.error } : {}),
  };
  const parsed = parseRuntimeMessage(msg) as IRuntimeReply<TPayload>;
  if (!parsed.ok) return parsed;
  const commandType = getReplyCommandType(parsed.type);
  if (!commandType) return parsed;
  return {
    ...parsed,
    payload: parseRuntimeReplyPayload(commandType, parsed.payload),
  } as IRuntimeReply<TPayload>;
};

const getReplyCommandType = (replyType: string): TRuntimeCommandType | null => {
  if (!replyType.endsWith('.reply')) return null;
  const commandType = replyType.slice(0, -'.reply'.length);
  return isRuntimeCommandType(commandType) ? commandType : null;
};

export const createRuntimeEvent = <TPayload>(input: ICreateEventInput<TPayload>): IRuntimeEvent<TPayload> => {
  const msg = parseRuntimeMessage({
    kind: 'event' as const,
    id: input.id ?? nextId(),
    source: input.source,
    target: input.target,
    type: input.type,
    sentAt: nowIso(),
    delivery: input.delivery,
    payload: input.payload,
  }) as IRuntimeEvent<TPayload>;

  if (!isRuntimeEventType(msg.type)) return msg;
  const expected = runtimeEventRegistry[msg.type];
  if (
    msg.source !== expected.source
    || msg.target !== expected.target
    || msg.delivery !== expected.delivery
  ) {
    throw new Error(`Invalid runtime IPC event for ${msg.type}: envelope mismatch`);
  }
  return { ...msg, payload: parseRuntimeEventPayload(msg.type, msg.payload) } as IRuntimeEvent<TPayload>;
};

export const parseRuntimeMessage = (value: unknown): TRuntimeMessage => {
  const parsed = messageSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`Invalid runtime IPC message: ${parsed.error.issues.map((i) => i.message).join(', ')}`);
  }
  return parsed.data as TRuntimeMessage;
};
```

- [ ] **Step 5: Add shared worker command validation helper**

Create `src/lib/runtime/worker-command-validation.ts`:

```ts
import { isRuntimeCommandType, type IRuntimeCommand } from '@/lib/runtime/ipc';

export interface IInvalidWorkerCommand {
  code: 'invalid-worker-command';
  message: string;
  retryable: false;
}

export interface IWorkerCommandValidationOptions {
  workerName: string;
  namespace: string;
}

export const validateWorkerCommandEnvelope = (
  command: IRuntimeCommand,
  options: IWorkerCommandValidationOptions,
): IInvalidWorkerCommand | null => {
  if (command.source !== 'supervisor') {
    return {
      code: 'invalid-worker-command',
      message: `Invalid command source: ${command.source}`,
      retryable: false,
    };
  }

  if (command.target !== options.workerName) {
    return {
      code: 'invalid-worker-command',
      message: `Invalid ${options.workerName} command target: ${command.target}`,
      retryable: false,
    };
  }

  if (!isRuntimeCommandType(command.type)) {
    return {
      code: 'invalid-worker-command',
      message: `Unregistered runtime command: ${command.type}`,
      retryable: false,
    };
  }

  if (!command.type.startsWith(`${options.namespace}.`)) {
    return {
      code: 'invalid-worker-command',
      message: `Invalid ${options.workerName} command namespace: ${command.type}`,
      retryable: false,
    };
  }

  return null;
};
```

Create `tests/unit/lib/runtime/worker-command-validation.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope } from '@/lib/runtime/worker-command-validation';

describe('validateWorkerCommandEnvelope', () => {
  const validateStorage = (overrides: Partial<Parameters<typeof createRuntimeCommand>[0]> = {}) =>
    validateWorkerCommandEnvelope(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: {},
      ...overrides,
    }), {
      workerName: 'storage',
      namespace: 'storage',
    });

  it('accepts supervisor commands for the target worker namespace', () => {
    expect(validateStorage()).toBeNull();
  });

  it('rejects invalid worker command envelopes with a shared error descriptor', () => {
    const cases = [
      validateStorage({ source: 'browser' }),
      validateStorage({ target: 'terminal' }),
      validateStorage({ type: 'storage.unknown' }),
      validateStorage({ type: 'terminal.health' }),
    ];

    for (const result of cases) {
      expect(result).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });
});
```

- [ ] **Step 6: Run IPC and worker command validation tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/ipc.test.ts
corepack pnpm vitest run tests/unit/lib/runtime/worker-command-validation.test.ts
```

Expected: PASS.

- [ ] **Step 7: Record checkpoint**

Record changed files and the IPC plus worker command validation test results. Do
not commit unless the user explicitly asks.

## Task 3: Worker Script Resolution And Client

**Files:**
- Create: `src/lib/runtime/worker-paths.ts`
- Create: `tests/unit/lib/runtime/worker-paths.test.ts`
- Create: `src/lib/runtime/worker-client.ts`
- Create: `tests/unit/lib/runtime/worker-client.test.ts`

- [ ] **Step 1: Write worker path resolution tests**

Create `tests/unit/lib/runtime/worker-paths.test.ts`:

```ts
import path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveRuntimeTmuxConfigPath, resolveRuntimeWorkerScript } from '@/lib/runtime/worker-paths';

describe('runtime worker path resolution', () => {
  it('uses TypeScript worker entrypoints with tsx in development', () => {
    expect(resolveRuntimeWorkerScript('storage-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: { NODE_ENV: 'development', __CMUX_APP_DIR: '/app' },
    })).toEqual({
      scriptPath: path.join('/app', 'src', 'workers', 'storage-worker.ts'),
      execArgv: ['--import', 'tsx'],
    });
  });

  it('uses dist worker entrypoints in web/npm production', () => {
    expect(resolveRuntimeWorkerScript('terminal-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toEqual({
      scriptPath: path.join('/app', 'dist', 'workers', 'terminal-worker.js'),
      execArgv: [],
    });
  });

  it('uses app.asar.unpacked dist worker entrypoints in packaged Electron', () => {
    expect(resolveRuntimeWorkerScript('terminal-worker', {
      cwd: '/repo',
      existsSync: () => true,
      env: {
        NODE_ENV: 'production',
        __CMUX_APP_DIR: '/Applications/codexmux.app/Contents/Resources/app.asar',
        __CMUX_APP_DIR_UNPACKED: '/Applications/codexmux.app/Contents/Resources/app.asar.unpacked',
      },
    })).toEqual({
      scriptPath: path.join('/Applications/codexmux.app/Contents/Resources/app.asar.unpacked', 'dist', 'workers', 'terminal-worker.js'),
      execArgv: [],
    });
  });

  it('fails clearly when runtime worker script is missing', () => {
    expect(() => resolveRuntimeWorkerScript('storage-worker', {
      cwd: '/repo',
      existsSync: () => false,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-worker-script-missing',
      retryable: false,
    }));
  });

  it('resolves runtime tmux config from the unpacked Electron app dir', () => {
    expect(resolveRuntimeTmuxConfigPath({
      cwd: '/repo',
      existsSync: () => true,
      env: {
        NODE_ENV: 'production',
        __CMUX_APP_DIR: '/Applications/codexmux.app/Contents/Resources/app.asar',
        __CMUX_APP_DIR_UNPACKED: '/Applications/codexmux.app/Contents/Resources/app.asar.unpacked',
      },
    })).toBe(path.join('/Applications/codexmux.app/Contents/Resources/app.asar.unpacked', 'src', 'config', 'tmux.conf'));
  });

  it('fails clearly when runtime tmux config is missing', () => {
    expect(() => resolveRuntimeTmuxConfigPath({
      cwd: '/repo',
      existsSync: () => false,
      env: { NODE_ENV: 'production', __CMUX_APP_DIR: '/app' },
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-tmux-config-missing',
      retryable: false,
    }));
  });
});
```

- [ ] **Step 2: Write worker client tests**

Create `tests/unit/lib/runtime/worker-client.test.ts`:

```ts
import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeEvent, createRuntimeReply } from '@/lib/runtime/ipc';
import { RuntimeWorkerClient } from '@/lib/runtime/worker-client';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  killed = false;
  connected = true;

  send = (message: unknown, callback?: (err?: Error | null) => void): boolean => {
    this.sent.push(message);
    callback?.();
    return true;
  };

  kill = (): boolean => {
    this.killed = true;
    this.connected = false;
    this.emit('exit', 0, null);
    return true;
  };
}

describe('runtime worker client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('correlates command replies', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('rejects reply envelope correlation mismatches before payload success', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'terminal.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects malformed replies with a known command id immediately', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: 'yes',
      payload: { ok: true },
    });

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('rejects discriminated reply shape violations immediately', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    });

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('drops malformed replies without a known command id until timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: 'yes',
      payload: { ok: true },
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('rejects replies from the wrong worker source', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'terminal',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects replies addressed to the wrong target', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'terminal',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects invalid registered command payloads before sending', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    await expect(client.request('terminal.resize', {
      sessionName: 'pt-ws-pane-tab',
      cols: 80,
      rows: 24,
    })).rejects.toThrow(/Invalid runtime IPC payload/);
    expect(child.sent).toEqual([]);
  });

  it('rejects unregistered commands before sending', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    await expect(client.request('storage.unknown', {})).rejects.toMatchObject({
      code: 'unsupported-runtime-command',
      retryable: false,
    });
    expect(child.sent).toEqual([]);
  });

  it('rejects invalid registered reply payloads', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.create-workspace', { name: 'Runtime', defaultCwd: '/tmp' });
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-workspace.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      payload: { id: 'ws-a' },
    });

    await expect(pending).rejects.toMatchObject({ code: 'invalid-worker-reply' });
  });

  it('times out pending commands', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    vi.advanceTimersByTime(25);

    await expect(pending).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it('ignores late success replies after timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });

    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    const next = client.request('storage.health', {});
    const nextSent = child.sent[1] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: nextSent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('ignores late failed replies after timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });

    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
      error: {
        code: 'late-domain-error',
        message: 'late failure',
        retryable: false,
      },
    }));

    const next = client.request('storage.health', {});
    const nextSent = child.sent[1] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: nextSent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('fails pending commands when the worker exits', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('terminal.create-session', {
      sessionName: 'rtv2-ws-pane-tab',
      cols: 80,
      rows: 24,
    });
    child.emit('exit', 1, null);

    await expect(pending).rejects.toThrow(/terminal worker exited/);
  });
});
```

Extend the same test file with these required behaviors before implementing:

```ts
it('restarts with bounded backoff after a crash before the next request', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
  });

  client.start();
  first.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);

  expect(spawn).toHaveBeenCalledTimes(2);
  expect(second.connected).toBe(true);
  vi.useRealTimers();
});

it('increases restart backoff after repeated crashes and caps at max', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const third = new FakeChild();
  const fourth = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never)
    .mockReturnValueOnce(third as never)
    .mockReturnValueOnce(fourth as never);
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    maxRestartBackoffMs: 20,
  });

  client.start();
  first.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);
  second.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(3);
  third.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(20);
  expect(spawn).toHaveBeenCalledTimes(4);
  vi.useRealTimers();
});

it('resets restart backoff after a successful reply', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const third = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never)
    .mockReturnValueOnce(third as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    maxRestartBackoffMs: 20,
  });

  client.start();
  first.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);

  const pending = client.request('storage.health', {});
  const sent = second.sent[0] as { id: string };
  second.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));
  await expect(pending).resolves.toEqual({ ok: true });

  second.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

it('does not reset restart backoff after an invalid success reply payload', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const third = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never)
    .mockReturnValueOnce(third as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    maxRestartBackoffMs: 20,
  });

  client.start();
  first.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);

  const pending = client.request('storage.create-workspace', { name: 'Runtime', defaultCwd: '/tmp' });
  const sent = second.sent[0] as { id: string };
  second.emit('message', {
    kind: 'reply',
    id: 'bad-reply',
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.create-workspace.reply',
    sentAt: new Date().toISOString(),
    ok: true,
    payload: { id: 'ws-a' },
  });
  await expect(pending).rejects.toMatchObject({ code: 'invalid-worker-reply' });

  second.emit('exit', 1, null);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

it('marks crash failures as retryable structured worker errors', async () => {
  const child = new FakeChild();
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
  });

  const pending = client.request('terminal.create-session', {
    sessionName: 'rtv2-ws-pane-tab',
    cols: 80,
    rows: 24,
  });
  child.emit('exit', 1, null);

  await expect(pending).rejects.toMatchObject({
    code: 'worker-exited',
    retryable: true,
  });
});

it('handles error followed by exit once for the current child', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const onExit = vi.fn();
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    onExit,
  });

  const pending = client.request('storage.health', {});
  first.emit('error', new Error('worker pipe failed'));
  first.emit('exit', 1, null);

  await expect(pending).rejects.toMatchObject({
    code: 'worker-error',
    retryable: true,
  });
  expect(onExit).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('kills the current child best-effort on worker error before restart', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
  });

  client.start();
  first.emit('error', new Error('worker pipe failed'));

  expect(first.killed).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('preserves structured failed worker replies', async () => {
  const child = new FakeChild();
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
  });

  const pending = client.request('storage.create-pending-terminal-tab', {
    id: 'tab-a',
    workspaceId: 'ws-a',
    paneId: 'pane-b',
    sessionName: 'rtv2-ws-a-pane-b-tab-a',
    cwd: '/tmp',
  });
  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.create-pending-terminal-tab.reply',
    ok: false,
    payload: null,
    error: {
      code: 'runtime-v2-pane-workspace-mismatch',
      message: 'pane does not belong to workspace',
      retryable: false,
    },
  }));

  await expect(pending).rejects.toMatchObject({
    code: 'runtime-v2-pane-workspace-mismatch',
    retryable: false,
  });
});

it('preserves retryable structured failed worker replies', async () => {
  const child = new FakeChild();
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
  });

  const pending = client.request('storage.health', {});
  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: false,
    payload: null,
    error: {
      code: 'storage-busy',
      message: 'database is busy',
      retryable: true,
    },
  }));

  await expect(pending).rejects.toMatchObject({
    code: 'storage-busy',
    retryable: true,
  });
});

it('does not report ready until the readiness command succeeds', async () => {
  const child = new FakeChild();
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    readinessCommand: 'storage.health',
  });

  const ready = client.waitUntilReady();
  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));

  await expect(ready).resolves.toBeUndefined();
});

it('restarts the worker when readiness command times out', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 25,
    restartBackoffMs: 10,
    readinessCommand: 'storage.health',
  });

  const ready = client.waitUntilReady();
  await vi.advanceTimersByTimeAsync(25);
  await expect(ready).rejects.toMatchObject({
    code: 'worker-timeout',
    retryable: true,
  });
  expect(first.killed).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('does not restart the worker for normal readiness failed replies', async () => {
  vi.useFakeTimers();
  const child = new FakeChild();
  const spawn = vi.fn(() => child as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    readinessCommand: 'storage.health',
  });

  const ready = client.waitUntilReady();
  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: false,
    payload: null,
    error: {
      code: 'storage-schema-invalid',
      message: 'schema invalid',
      retryable: false,
    },
  }));

  await expect(ready).rejects.toMatchObject({
    code: 'storage-schema-invalid',
    retryable: false,
  });
  await vi.advanceTimersByTimeAsync(10);
  expect(child.killed).toBe(false);
  expect(spawn).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('restarts a disconnected child before sending a request', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  first.connected = false;
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
  });

  await expect(client.request('storage.health', {})).rejects.toMatchObject({
    code: 'worker-not-connected',
    retryable: true,
  });
  expect(first.killed).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);
  vi.useRealTimers();
});

it('delivers runtime events to onEvent', () => {
  const child = new FakeChild();
  const onEvent = vi.fn();
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    onEvent,
  });

  client.start();
  const event = createRuntimeEvent({
    source: 'terminal',
    target: 'supervisor',
    type: 'terminal.stdout',
    delivery: 'realtime',
    payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
  });
  child.emit('message', event);

  expect(onEvent).toHaveBeenCalledWith(event);
});

it('delivers terminal backpressure events to onEvent', () => {
  const child = new FakeChild();
  const onEvent = vi.fn();
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    onEvent,
  });

  client.start();
  const event = createRuntimeEvent({
    source: 'terminal',
    target: 'supervisor',
    type: 'terminal.backpressure',
    delivery: 'realtime',
    payload: {
      sessionName: 'rtv2-ws-pane-tab',
      pendingBytes: 4096,
      maxPendingStdoutBytes: 2048,
    },
  });
  child.emit('message', event);

  expect(onEvent).toHaveBeenCalledWith(event);
});

it('drops mismatched or malformed runtime events without restarting', () => {
  const child = new FakeChild();
  const onEvent = vi.fn();
  const onExit = vi.fn();
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    onEvent,
    onExit,
  });

  client.start();
  child.emit('message', {
    kind: 'event',
    id: 'evt-source-mismatch',
    source: 'storage',
    target: 'supervisor',
    type: 'terminal.stdout',
    sentAt: new Date().toISOString(),
    delivery: 'realtime',
    payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
  });
  child.emit('message', {
    kind: 'event',
    id: 'evt-target-mismatch',
    source: 'terminal',
    target: 'storage',
    type: 'terminal.stdout',
    sentAt: new Date().toISOString(),
    delivery: 'realtime',
    payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
  });
  child.emit('message', {
    kind: 'event',
    id: 'evt-malformed-payload',
    source: 'terminal',
    target: 'supervisor',
    type: 'terminal.stdout',
    sentAt: new Date().toISOString(),
    delivery: 'realtime',
    payload: { sessionName: 'pt-ws-pane-tab', data: 'hello' },
  });

  expect(onEvent).not.toHaveBeenCalled();
  expect(onExit).not.toHaveBeenCalled();
  expect(child.killed).toBe(false);
});

it('rejects pending and future commands and does not restart after shutdown', async () => {
  vi.useFakeTimers();
  const child = new FakeChild();
  const spawn = vi.fn(() => child as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    readinessCommand: 'storage.health',
  });

  const pending = client.request('storage.health', {});
  client.shutdown();
  await expect(pending).rejects.toMatchObject({
    code: 'worker-shutdown',
    retryable: false,
  });
  await vi.advanceTimersByTimeAsync(10);

  expect(child.killed).toBe(true);
  await expect(client.request('storage.health', {})).rejects.toMatchObject({
    code: 'worker-shutdown',
    retryable: false,
  });
  await expect(client.waitUntilReady()).rejects.toMatchObject({
    code: 'worker-shutdown',
    retryable: false,
  });
  client.start();
  expect(spawn).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('treats shutdown child kill failure as best-effort cleanup', async () => {
  vi.useFakeTimers();
  const child = new FakeChild();
  child.kill = vi.fn(() => {
    throw new Error('kill failed');
  });
  const spawn = vi.fn(() => child as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
  });

  const pending = client.request('storage.health', {});
  expect(() => client.shutdown()).not.toThrow();
  await expect(pending).rejects.toMatchObject({
    code: 'worker-shutdown',
    retryable: false,
  });
  await vi.advanceTimersByTimeAsync(10);

  await expect(client.request('storage.health', {})).rejects.toMatchObject({
    code: 'worker-shutdown',
    retryable: false,
  });
  expect(spawn).toHaveBeenCalledTimes(1);
  vi.useRealTimers();
});

it('treats child.send false as backpressure and waits for a reply', async () => {
  const child = new FakeChild();
  child.send = vi.fn((message: unknown, callback?: (err?: Error | null) => void) => {
    child.sent.push(message);
    callback?.();
    return false;
  });
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
  });

  const pending = client.request('storage.health', {});
  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));

  await expect(pending).resolves.toEqual({ ok: true });
});

it('restarts the worker when child.send callback reports an error', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  first.send = vi.fn((_message: unknown, callback?: (err?: Error | null) => void) => {
    callback?.(new Error('ipc channel closed'));
    return true;
  });
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    maxPendingRequests: 1,
  });

  await expect(client.request('storage.health', {})).rejects.toMatchObject({
    code: 'worker-not-connected',
    retryable: true,
  });
  expect(first.killed).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);

  const next = client.request('storage.health', {});
  const sent = second.sent[0] as { id: string };
  second.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));
  await expect(next).resolves.toEqual({ ok: true });
  vi.useRealTimers();
});

it('ignores child.send callback errors after request timeout', async () => {
  vi.useFakeTimers();
  let sendCallback: ((err?: Error | null) => void) | undefined;
  const child = new FakeChild();
  child.send = vi.fn((message: unknown, callback?: (err?: Error | null) => void) => {
    child.sent.push(message);
    sendCallback = callback;
    return true;
  });
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 25,
  });

  const pending = client.request('storage.health', {});
  await vi.advanceTimersByTimeAsync(25);
  await expect(pending).rejects.toMatchObject({
    code: 'worker-timeout',
    retryable: true,
  });

  sendCallback?.(new Error('late send failure'));
  expect(child.killed).toBe(false);
  const next = client.request('storage.health', {});
  const sent = child.sent[1] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));
  await expect(next).resolves.toEqual({ ok: true });
  vi.useRealTimers();
});

it('restarts the worker when child.send throws after registration', async () => {
  vi.useFakeTimers();
  const first = new FakeChild();
  const second = new FakeChild();
  first.send = vi.fn(() => {
    throw new Error('ipc channel closed');
  });
  const spawn = vi.fn()
    .mockReturnValueOnce(first as never)
    .mockReturnValueOnce(second as never);
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn,
    requestTimeoutMs: 1000,
    restartBackoffMs: 10,
    maxPendingRequests: 1,
  });

  await expect(client.request('storage.health', {})).rejects.toMatchObject({
    code: 'worker-not-connected',
    retryable: true,
  });
  expect(first.killed).toBe(true);
  await vi.advanceTimersByTimeAsync(10);
  expect(spawn).toHaveBeenCalledTimes(2);

  const next = client.request('storage.health', {});
  const sent = second.sent[0] as { id: string };
  second.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));
  await expect(next).resolves.toEqual({ ok: true });
  vi.useRealTimers();
});

it('rejects requests before sending when pending request limit is reached', async () => {
  const child = new FakeChild();
  const client = new RuntimeWorkerClient({
    name: 'storage',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    maxPendingRequests: 1,
  });

  const first = client.request('storage.health', {});
  await expect(client.request('storage.list-workspaces', {})).rejects.toMatchObject({
    code: 'worker-overloaded',
    retryable: true,
  });
  expect(child.sent).toHaveLength(1);

  const sent = child.sent[0] as { id: string };
  child.emit('message', createRuntimeReply({
    commandId: sent.id,
    source: 'storage',
    target: 'supervisor',
    type: 'storage.health.reply',
    ok: true,
    payload: { ok: true },
  }));
  await expect(first).resolves.toEqual({ ok: true });
});

it('ignores stale child events after shutdown listener cleanup', () => {
  const child = new FakeChild();
  const onEvent = vi.fn();
  const onExit = vi.fn();
  const client = new RuntimeWorkerClient({
    name: 'terminal',
    spawn: () => child as never,
    requestTimeoutMs: 1000,
    onEvent,
    onExit,
  });

  client.start();
  client.shutdown();
  child.emit('message', createRuntimeEvent({
    source: 'terminal',
    target: 'supervisor',
    type: 'terminal.stdout',
    delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-pane-tab', data: 'late output' },
  }));
  child.emit('exit', 1, null);

  expect(onEvent).not.toHaveBeenCalled();
  expect(onExit).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run worker path/client tests and confirm failure**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/worker-client.test.ts
```

Expected: FAIL with missing `worker-paths` and `worker-client`.

- [ ] **Step 4: Implement worker path resolution**

Create `src/lib/runtime/worker-paths.ts`:

```ts
import fs from 'fs';
import path from 'path';

export type TRuntimeWorkerName = 'storage-worker' | 'terminal-worker';

export interface IWorkerScriptResolution {
  scriptPath: string;
  execArgv: string[];
}

export interface IResolveRuntimeWorkerScriptOptions {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  existsSync?: (path: string) => boolean;
}

const resolveRuntimeAppDir = (options: IResolveRuntimeWorkerScriptOptions = {}): string => {
  const env = options.env ?? process.env;
  const cwd = options.cwd ?? process.cwd();
  if (env.NODE_ENV !== 'production') return env.__CMUX_APP_DIR || cwd;
  return env.__CMUX_APP_DIR_UNPACKED || env.__CMUX_APP_DIR || cwd;
};

export const resolveRuntimeWorkerScript = (
  name: TRuntimeWorkerName,
  options: IResolveRuntimeWorkerScriptOptions = {},
): IWorkerScriptResolution => {
  const env = options.env ?? process.env;
  const existsSync = options.existsSync ?? fs.existsSync;
  const dev = env.NODE_ENV !== 'production';
  const appDir = resolveRuntimeAppDir(options);
  const resolution = dev
    ? {
        scriptPath: path.join(appDir, 'src', 'workers', `${name}.ts`),
        execArgv: ['--import', 'tsx'],
      }
    : {
        scriptPath: path.join(appDir, 'dist', 'workers', `${name}.js`),
        execArgv: [],
      };

  if (!existsSync(resolution.scriptPath)) {
    throw Object.assign(
      new Error(`Runtime v2 worker script is missing: ${resolution.scriptPath}`),
      {
        code: 'runtime-v2-worker-script-missing',
        retryable: false,
      },
    );
  }
  return resolution;
};

export const resolveRuntimeTmuxConfigPath = (
  options: IResolveRuntimeWorkerScriptOptions = {},
): string => {
  const existsSync = options.existsSync ?? fs.existsSync;
  const configPath = path.join(resolveRuntimeAppDir(options), 'src', 'config', 'tmux.conf');
  if (!existsSync(configPath)) {
    throw Object.assign(
      new Error(`Runtime v2 tmux config is missing: ${configPath}`),
      {
        code: 'runtime-v2-tmux-config-missing',
        retryable: false,
      },
    );
  }
  return configPath;
};
```

Resolution matrix:

| Mode | Env | Worker Script | `execArgv` |
| --- | --- | --- | --- |
| dev via `corepack pnpm dev` / `tsx watch server.ts` | `NODE_ENV !== 'production'` | `${__CMUX_APP_DIR || cwd}/src/workers/*.ts` | `['--import', 'tsx']` |
| web/npm production | `NODE_ENV=production`, no `__CMUX_APP_DIR_UNPACKED` | `${__CMUX_APP_DIR || cwd}/dist/workers/*.js` | `[]` |
| packaged Electron | `NODE_ENV=production`, `__CMUX_APP_DIR_UNPACKED` set | `${__CMUX_APP_DIR_UNPACKED}/dist/workers/*.js` | `[]` |

Worker script resolution and runtime tmux config resolution use the same app-dir
rules. Worker scripts must exist at the resolved dev/web/Electron path or
startup fails with non-retryable `runtime-v2-worker-script-missing` before
`fork()`. Runtime tmux config resolution returns `${appDir}/src/config/tmux.conf`.
The file must exist in dev source checkout, web/npm package output, and packaged
Electron `app.asar.unpacked`; otherwise Terminal Worker startup fails with
`runtime-v2-tmux-config-missing`. Terminal Worker must also fail startup with
`runtime-v2-tmux-config-source-failed` if tmux rejects the resolved config during
`source-file`.

- [ ] **Step 5: Implement worker client**

Create `src/lib/runtime/worker-client.ts`:

Timeout contract: when a request times out, remove its `commandId` from
`pending` and reject with retryable `worker-timeout`. If a worker later sends a
reply for that removed `commandId`, `handleMessage()` must ignore it before any
reply validation, request resolution/rejection, readiness state change, or
restart backoff reset.

Send contract: use `child.send(msg, callback)`. Treat the boolean return value
only as a backpressure signal; do not fail the request solely because it returns
`false`. If an existing child is already disconnected before send, reject the
request with retryable `worker-not-connected` and route that child through
`handleChildFailure()` for best-effort kill/restart. If no current child exists,
reject with retryable `worker-not-connected` without scheduling an extra restart.
If the callback reports an error, or `child.send()` throws while registering the
send, clear the timeout, remove the pending request, and reject with retryable
`worker-not-connected`, then send the captured child through
`handleChildFailure()` for best-effort kill/restart. If timeout wins before the
send callback, the callback is ignored because the pending request is already
gone and must not restart the worker.

Shutdown contract: `shutdown()` is terminal for that `RuntimeWorkerClient`
instance. It rejects pending requests with non-retryable `worker-shutdown`, kills
the current child best-effort without scheduling restart or throwing on kill
failure, clears readiness, makes later `start()` calls no-op, and makes later
`request()`/`waitUntilReady()` calls reject with non-retryable
`worker-shutdown`. A fresh Supervisor/client instance is required to use that
worker again.

Readiness contract: `waitUntilReady()` runs the configured readiness command
before Supervisor accepts traffic. If that readiness request fails with
transport/lifecycle error codes (`worker-timeout`, `worker-not-connected`,
`worker-error`, or `worker-exited`), route the captured child through
`handleChildFailure()` for best-effort kill/restart. Normal worker failed replies
are returned to the caller without restart unless they use one of those lifecycle
codes.

```ts
import { fork, type ChildProcess } from 'child_process';
import {
  createRuntimeCommand,
  isRuntimeEventType,
  isRuntimeCommandType,
  parseRuntimeCommandPayload,
  parseRuntimeEventPayload,
  parseRuntimeMessage,
  parseRuntimeReplyPayload,
  runtimeEventRegistry,
  type TRuntimeMessage,
} from '@/lib/runtime/ipc';
import { resolveRuntimeWorkerScript, type TRuntimeWorkerName } from '@/lib/runtime/worker-paths';

interface IPendingRequest {
  commandType: string;
  expectedSource: string;
  expectedTarget: 'supervisor';
  expectedReplyType: string;
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface IRuntimeWorkerClientOptions {
  name: 'storage' | 'terminal';
  workerName?: TRuntimeWorkerName;
  requestTimeoutMs?: number;
  restartBackoffMs?: number;
  maxRestartBackoffMs?: number;
  maxPendingRequests?: number;
  readinessCommand?: string;
  onEvent?: (message: TRuntimeMessage) => void;
  onExit?: (err: Error) => void;
  spawn?: () => ChildProcess;
}

export class RuntimeWorkerClient {
  private child: ChildProcess | null = null;
  private pending = new Map<string, IPendingRequest>();
  private readonly requestTimeoutMs: number;
  private readonly initialRestartBackoffMs: number;
  private readonly maxRestartBackoffMs: number;
  private readonly maxPendingRequests: number;
  private currentRestartBackoffMs: number;
  private stopped = false;
  private readyPromise: Promise<void> | null = null;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: IRuntimeWorkerClientOptions) {
    this.requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
    this.initialRestartBackoffMs = options.restartBackoffMs ?? 250;
    this.maxRestartBackoffMs = options.maxRestartBackoffMs ?? 2_000;
    this.maxPendingRequests = options.maxPendingRequests ?? 100;
    this.currentRestartBackoffMs = this.initialRestartBackoffMs;
  }

  start(): void {
    if (this.stopped) return;
    if (this.child || this.restartTimer) return;
    this.spawnChild();
  }

  async waitUntilReady(): Promise<void> {
    if (this.stopped) throw this.createShutdownError();
    this.start();
    if (!this.options.readinessCommand) return;
    if (!this.readyPromise) {
      const child = this.child;
      this.readyPromise = this.request(this.options.readinessCommand, {})
        .then(() => undefined)
        .catch((err) => {
          this.readyPromise = null;
          if (child && this.shouldRestartAfterReadinessFailure(err)) {
            this.handleChildFailure(child, err);
          }
          throw err;
        });
    }
    return this.readyPromise;
  }

  private spawnChild(): void {
    const child = this.options.spawn ? this.options.spawn() : this.spawnDefault();
    this.child = child;
    child.on('message', this.handleMessage);
    child.on('exit', (code, signal) => {
      this.handleChildFailure(child, Object.assign(new Error(`${this.options.name} worker exited`), {
        code: 'worker-exited',
        retryable: true,
        exitCode: code,
        signal,
      }));
    });
    child.on('error', (err) => {
      this.handleChildFailure(child, Object.assign(err, {
        code: 'worker-error',
        retryable: true,
      }));
    });
  }

  async request<TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> {
    if (this.stopped) throw this.createShutdownError();
    if (!isRuntimeCommandType(type)) {
      throw Object.assign(new Error(`Unregistered runtime command: ${type}`), {
        code: 'unsupported-runtime-command',
        retryable: false,
      });
    }
    const validatedPayload = parseRuntimeCommandPayload(type, payload);

    this.start();
    const child = this.child;
    if (!child) {
      throw Object.assign(new Error(`${this.options.name} worker is not connected`), {
        code: 'worker-not-connected',
        retryable: true,
      });
    }
    if (!child.connected) {
      const err = Object.assign(new Error(`${this.options.name} worker is not connected`), {
        code: 'worker-not-connected',
        retryable: true,
      });
      this.handleChildFailure(child, err);
      throw err;
    }
    if (this.pending.size >= this.maxPendingRequests) {
      throw Object.assign(new Error(`${this.options.name} worker has too many pending commands`), {
        code: 'worker-overloaded',
        retryable: true,
      });
    }

    const msg = createRuntimeCommand({
      source: 'supervisor',
      target: this.options.name,
      type,
      payload: validatedPayload,
    });

    const result = new Promise<TResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        reject(Object.assign(new Error(`${this.options.name} command '${type}' timed out`), {
          code: 'worker-timeout',
          retryable: true,
        }));
      }, this.requestTimeoutMs);
      this.pending.set(msg.id, {
        commandType: type,
        expectedSource: this.options.name,
        expectedTarget: 'supervisor',
        expectedReplyType: `${type}.reply`,
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
    });

    const failSend = (err?: unknown): void => {
      const pendingRequest = this.pending.get(msg.id);
      if (!pendingRequest) return;
      if (pendingRequest) clearTimeout(pendingRequest.timer);
      this.pending.delete(msg.id);
      const suffix = err instanceof Error ? `: ${err.message}` : '';
      const sendError = Object.assign(new Error(`${this.options.name} worker rejected command '${type}'${suffix}`), {
        code: 'worker-not-connected',
        retryable: true,
      });
      pendingRequest.reject(sendError);
      this.handleChildFailure(child, sendError);
    };

    try {
      child.send(msg, (err) => {
        if (err) failSend(err);
      });
    } catch (err) {
      failSend(err);
    }
    return result;
  }

  shutdown(): void {
    this.stopped = true;
    if (this.restartTimer) {
      clearTimeout(this.restartTimer);
      this.restartTimer = null;
    }
    this.rejectPending(this.createShutdownError());
    this.readyPromise = null;
    if (!this.child) return;
    const child = this.child;
    this.child = null;
    this.cleanupChild(child);
    try {
      child.kill();
    } catch {
      undefined;
    }
  }

  private createShutdownError(): Error {
    return Object.assign(new Error(`${this.options.name} worker shut down`), {
      code: 'worker-shutdown',
      retryable: false,
    });
  }

  private shouldRestartAfterReadinessFailure(err: unknown): boolean {
    const code = typeof err === 'object' && err && 'code' in err
      ? (err as { code?: unknown }).code
      : undefined;
    return code === 'worker-timeout'
      || code === 'worker-not-connected'
      || code === 'worker-error'
      || code === 'worker-exited';
  }

  private spawnDefault(): ChildProcess {
    const workerName = this.options.workerName ?? `${this.options.name}-worker` as TRuntimeWorkerName;
    const resolved = resolveRuntimeWorkerScript(workerName);
    return fork(resolved.scriptPath, [], {
      execArgv: resolved.execArgv,
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
      env: {
        ...process.env,
        ...(process.env.CODEXMUX_RUNTIME_DB ? { CODEXMUX_RUNTIME_DB: process.env.CODEXMUX_RUNTIME_DB } : {}),
      },
    });
  }

  private cleanupChild(child: ChildProcess): void {
    child.removeAllListeners('message');
    child.removeAllListeners('exit');
    child.removeAllListeners('error');
  }

  private handleMessage = (raw: unknown): void => {
    let msg: TRuntimeMessage;
    try {
      msg = parseRuntimeMessage(raw);
    } catch (err) {
      this.rejectMalformedReply(raw, err);
      return;
    }

    if (msg.kind === 'event') {
      if (!isRuntimeEventType(msg.type)) return;
      const expected = runtimeEventRegistry[msg.type];
      if (
        msg.source !== expected.source
        || msg.source !== this.options.name
        || msg.target !== expected.target
        || msg.delivery !== expected.delivery
      ) {
        return;
      }
      try {
        const payload = parseRuntimeEventPayload(msg.type, msg.payload);
        this.options.onEvent?.({ ...msg, payload });
      } catch {
        return;
      }
      return;
    }
    if (msg.kind !== 'reply') return;
    const pending = this.pending.get(msg.commandId);
    if (!pending) return;
    this.pending.delete(msg.commandId);
    clearTimeout(pending.timer);
    if (
      msg.source !== pending.expectedSource
      || msg.target !== pending.expectedTarget
      || msg.type !== pending.expectedReplyType
    ) {
      pending.reject(Object.assign(new Error(`${this.options.name} worker sent mismatched reply for '${pending.commandType}'`), {
        code: 'invalid-worker-reply',
        retryable: false,
      }));
      return;
    }

    if (!msg.ok) {
      pending.reject(Object.assign(new Error(msg.error?.message ?? `${this.options.name} command failed`), {
        code: msg.error?.code ?? 'worker-command-failed',
        retryable: msg.error?.retryable ?? false,
      }));
      return;
    }
    try {
      const payload = isRuntimeCommandType(pending.commandType)
        ? parseRuntimeReplyPayload(pending.commandType, msg.payload)
        : msg.payload;
      this.currentRestartBackoffMs = this.initialRestartBackoffMs;
      pending.resolve(payload);
    } catch (err) {
      pending.reject(Object.assign(new Error(err instanceof Error ? err.message : String(err)), {
        code: 'invalid-worker-reply',
        retryable: false,
      }));
    }
  };

  private rejectMalformedReply(raw: unknown, err: unknown): void {
    const commandId = this.getMalformedReplyCommandId(raw);
    if (!commandId) return;
    const pending = this.pending.get(commandId);
    if (!pending) return;
    this.pending.delete(commandId);
    clearTimeout(pending.timer);
    pending.reject(Object.assign(
      new Error(err instanceof Error ? err.message : `${this.options.name} worker sent malformed reply`),
      {
        code: 'invalid-worker-reply',
        retryable: false,
      },
    ));
  }

  private getMalformedReplyCommandId(raw: unknown): string | null {
    if (typeof raw !== 'object' || !raw) return null;
    const candidate = raw as { kind?: unknown; commandId?: unknown };
    if (candidate.kind !== 'reply') return null;
    if (typeof candidate.commandId !== 'string' || candidate.commandId.length === 0) return null;
    return candidate.commandId;
  }

  private rejectPending(err: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(err);
    }
    this.pending.clear();
  }

  private scheduleRestart(): void {
    if (this.stopped || this.restartTimer) return;
    const delay = Math.min(this.currentRestartBackoffMs, this.maxRestartBackoffMs);
    this.currentRestartBackoffMs = Math.min(this.currentRestartBackoffMs * 2, this.maxRestartBackoffMs);
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (!this.stopped) this.spawnChild();
    }, delay);
  }

  private handleChildFailure(child: ChildProcess, err: Error): void {
    if (this.child !== child) return;
    this.child = null;
    this.options.onExit?.(err);
    this.rejectPending(err);
    try {
      child.kill();
    } catch {
      undefined;
    }
    this.cleanupChild(child);
    this.readyPromise = null;
    this.scheduleRestart();
  }
}
```

This code block is the final implementation skeleton for Task 3. Do not replace
it with a request/reply-only baseline; readiness, retryable structured failures,
increasing bounded restart backoff with successful-reply reset, pending request
overload protection, event delivery, exit callbacks, and listener cleanup are
part of the required behavior.

- [ ] **Step 6: Run worker path/client tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/worker-client.test.ts
```

Expected: PASS.

- [ ] **Step 7: Record checkpoint**

Record changed files and the Worker Path/Worker Client test result. Do not
commit unless the user explicitly asks.

## Task 4: SQLite Schema And Repository

**Files:**
- Create: `src/lib/runtime/storage/schema.ts`
- Create: `src/lib/runtime/storage/repository.ts`
- Create: `tests/unit/lib/runtime/storage-repository.test.ts`

- [ ] **Step 1: Write repository tests**

Create `tests/unit/lib/runtime/storage-repository.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import { createStorageRepository } from '@/lib/runtime/storage/repository';

describe('runtime storage repository', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-db-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('creates pending terminal tab intents, assigns stable order, finalizes active tab, and projects only ready tabs', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });
    const firstPending = repo.createPendingTerminalTab({
      id: 'tab-runtime-a',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime-a`,
      cwd: dir,
    });
    const secondPending = repo.createPendingTerminalTab({
      id: 'tab-runtime-b',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime-b`,
      cwd: dir,
    });

    const pendingLayout = repo.getWorkspaceLayout(workspace.id);
    if (pendingLayout?.root.type === 'pane') {
      expect(pendingLayout.root.tabs).toEqual([]);
    }

    const firstTab = repo.finalizeTerminalTab({ id: firstPending.id });
    const secondTab = repo.finalizeTerminalTab({ id: secondPending.id });
    const layout = repo.getWorkspaceLayout(workspace.id);

    expect(firstTab.order).toBe(0);
    expect(secondTab.order).toBe(1);
    expect(secondTab.lifecycleState).toBe('ready');
    expect(layout?.activePaneId).toBe(workspace.rootPaneId);
    expect(layout?.root.type).toBe('pane');
    if (layout?.root.type === 'pane') {
      expect(layout.root.activeTabId).toBe(secondTab.id);
      expect(layout.root.tabs.map((tab) => ({ id: tab.id, order: tab.order }))).toEqual([
        { id: firstTab.id, order: 0 },
        { id: secondTab.id, order: 1 },
      ]);
      expect(layout.root.tabs[0].sessionName).toMatch(/^rtv2-ws-/);
    }

    expect(() => repo.finalizeTerminalTab({ id: 'tab-missing' })).toThrow(expect.objectContaining({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));
    expect(() => repo.finalizeTerminalTab({ id: secondTab.id })).toThrow(expect.objectContaining({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));
  });

  it('rejects terminal tabs for panes outside the supplied workspace', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });
    const otherWorkspace = repo.createWorkspace({ name: 'Other', defaultCwd: dir });

    expect(() => repo.createPendingTerminalTab({
      id: 'tab-runtime',
      workspaceId: workspace.id,
      paneId: otherWorkspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${otherWorkspace.rootPaneId}-tab-runtime`,
      cwd: dir,
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    }));

    expect(repo.listPendingTerminalTabs()).toEqual([]);
  });

  it('records mutation events', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });

    expect(repo.listMutationEvents()).toEqual([
      expect.objectContaining({ entityType: 'workspace', eventType: 'workspace.created' }),
    ]);
  });

  it('lists persisted workspaces for reload smoke', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });

    expect(repo.listWorkspaces()).toEqual([
      expect.objectContaining({ id: workspace.id, name: 'Runtime', defaultCwd: dir }),
    ]);
  });

  it('marks pending terminal tabs failed for reconciliation', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });
    const pending = repo.createPendingTerminalTab({
      id: 'tab-runtime',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
      cwd: dir,
    });

    expect(repo.listPendingTerminalTabs()).toEqual([
      expect.objectContaining({ id: pending.id, lifecycleState: 'pending_terminal' }),
    ]);

    repo.failPendingTerminalTab({ id: pending.id, reason: 'terminal create failed' });

    expect(repo.listPendingTerminalTabs()).toEqual([]);

    expect(() => repo.failPendingTerminalTab({ id: 'tab-missing', reason: 'missing' })).toThrow(expect.objectContaining({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));

    const finalized = repo.createPendingTerminalTab({
      id: 'tab-finalized',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-finalized`,
      cwd: dir,
    });
    repo.finalizeTerminalTab({ id: finalized.id });
    expect(() => repo.failPendingTerminalTab({ id: finalized.id, reason: 'already finalized' })).toThrow(expect.objectContaining({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));
  });

  it('deletes a workspace and returns cleanup sessions from the delete transaction', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);

    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });
    const readyPending = repo.createPendingTerminalTab({
      id: 'tab-ready',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-ready`,
      cwd: dir,
    });
    const stillPending = repo.createPendingTerminalTab({
      id: 'tab-pending',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-pending`,
      cwd: dir,
    });
    const failedPending = repo.createPendingTerminalTab({
      id: 'tab-failed',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-failed`,
      cwd: dir,
    });
    repo.finalizeTerminalTab({ id: readyPending.id });
    repo.failPendingTerminalTab({ id: failedPending.id, reason: 'already reconciled' });

    expect(repo.deleteWorkspace({ workspaceId: workspace.id })).toEqual({
      deleted: true,
      sessions: [
        { sessionName: readyPending.sessionName },
        { sessionName: stillPending.sessionName },
      ],
    });
    expect(repo.listWorkspaces()).toEqual([]);
    expect(repo.getWorkspaceLayout(workspace.id)).toBeNull();
    expect(repo.listMutationEvents()).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityType: 'workspace', entityId: workspace.id, eventType: 'workspace.deleted' }),
    ]));

    const eventCount = repo.listMutationEvents().length;
    db.pragma('foreign_keys = OFF');
    db.prepare(`
      insert into tabs (id, workspace_id, pane_id, session_name, panel_type, name, lifecycle_state, order_index, created_at, updated_at)
      values (?, ?, ?, ?, 'terminal', '', 'ready', 0, ?, ?)
    `).run(
      'tab-orphan',
      'ws-missing',
      'pane-missing',
      'rtv2-ws-missing-pane-missing-tab-orphan',
      new Date().toISOString(),
      new Date().toISOString(),
    );
    db.pragma('foreign_keys = ON');
    expect(repo.deleteWorkspace({ workspaceId: 'ws-missing' })).toEqual({ deleted: false, sessions: [] });
    expect(repo.listMutationEvents()).toHaveLength(eventCount);
  });

  it('finds only finalized ready terminal tabs by session name', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const repo = createStorageRepository(db);
    const workspace = repo.createWorkspace({ name: 'Runtime', defaultCwd: dir });
    const pending = repo.createPendingTerminalTab({
      id: 'tab-runtime',
      workspaceId: workspace.id,
      paneId: workspace.rootPaneId,
      sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
      cwd: dir,
    });

    expect(repo.getReadyTerminalTabBySession(pending.sessionName)).toBeNull();
    repo.finalizeTerminalTab({ id: pending.id });
    expect(repo.getReadyTerminalTabBySession(pending.sessionName)).toEqual(
      expect.objectContaining({ id: pending.id, lifecycleState: 'ready' }),
    );
    expect(repo.getReadyTerminalTabBySession('rtv2-ws-missing-pane-missing-tab-missing')).toBeNull();
  });

  it('reports a clear error when optional better-sqlite3 is unavailable', () => {
    expect(() => openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'), {
      loadDatabase: () => {
        throw new Error('Cannot find module better-sqlite3');
      },
    })).toThrow(expect.objectContaining({
      code: 'runtime-v2-sqlite-unavailable',
    }));
  });

  it('records schema migration v1 and reopens idempotently', () => {
    const dbPath = path.join(dir, 'runtime-v2', 'state.db');
    const db = openRuntimeDatabase(dbPath);

    expect(db.prepare(`select version from schema_migrations order by version`).all()).toEqual([
      { version: 1 },
    ]);
    db.close();

    const reopened = openRuntimeDatabase(dbPath);
    expect(reopened.prepare(`select version, count(*) as count from schema_migrations group by version`).all()).toEqual([
      { version: 1, count: 1 },
    ]);
  });

  it('applies runtime sqlite pragmas', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));

    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    expect(String(db.pragma('journal_mode', { simple: true })).toLowerCase()).toBe('wal');
    expect(Number(db.pragma('synchronous', { simple: true }))).toBe(1);
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
  });

  it('rejects databases from a newer runtime schema version', () => {
    const dbPath = path.join(dir, 'runtime-v2', 'state.db');
    const db = openRuntimeDatabase(dbPath);
    db.prepare(`insert into schema_migrations(version, applied_at) values(?, ?)`).run(99, new Date().toISOString());
    db.close();

    expect(() => openRuntimeDatabase(dbPath)).toThrow(expect.objectContaining({
      code: 'runtime-v2-schema-too-new',
      retryable: false,
    }));
  });

  it('creates the full foundation schema', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
    const tables = db.prepare(`
      select name from sqlite_master where type = 'table' order by name asc
    `).all() as Array<{ name: string }>;
    const indexes = db.prepare(`
      select name from sqlite_master where type = 'index' and name not like 'sqlite_autoindex_%' order by name asc
    `).all() as Array<{ name: string }>;

    expect(tables.map((t) => t.name)).toEqual(expect.arrayContaining([
      'schema_migrations',
      'workspaces',
      'workspace_groups',
      'panes',
      'tabs',
      'tab_status',
      'agent_sessions',
      'remote_sources',
      'mutation_events',
      'status_events',
    ]));
    expect(indexes.map((i) => i.name)).toEqual(expect.arrayContaining([
      'idx_runtime_agent_sessions_provider_source',
      'idx_runtime_mutation_events_created_at',
      'idx_runtime_panes_workspace_parent_position',
      'idx_runtime_remote_sources_label_host',
      'idx_runtime_tabs_lifecycle_state_created_at',
      'idx_runtime_status_events_tab_created_at',
      'idx_runtime_tabs_workspace_pane_order',
      'idx_runtime_workspaces_group_order',
    ]));

    const workspaceFks = db.prepare(`pragma foreign_key_list(workspaces)`).all() as Array<{ table: string; from: string }>;
    const paneFks = db.prepare(`pragma foreign_key_list(panes)`).all() as Array<{ table: string; from: string }>;
    const tabStatusFks = db.prepare(`pragma foreign_key_list(tab_status)`).all() as Array<{ table: string; from: string }>;
    const statusEventFks = db.prepare(`pragma foreign_key_list(status_events)`).all() as Array<{ table: string; from: string }>;

    expect(workspaceFks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'workspace_groups', from: 'group_id' }),
    ]));
    expect(paneFks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'workspaces', from: 'workspace_id' }),
      expect.objectContaining({ table: 'panes', from: 'parent_id' }),
      expect.objectContaining({ table: 'tabs', from: 'active_tab_id' }),
    ]));
    expect(tabStatusFks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'tabs', from: 'tab_id' }),
      expect.objectContaining({ table: 'agent_sessions', from: 'agent_session_id' }),
    ]));
    expect(statusEventFks).toEqual(expect.arrayContaining([
      expect.objectContaining({ table: 'tabs', from: 'tab_id' }),
      expect.objectContaining({ table: 'agent_sessions', from: 'agent_session_id' }),
    ]));
  });
});
```

- [ ] **Step 2: Run repository tests and confirm failure**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts
```

Expected: FAIL with missing storage modules.

- [ ] **Step 3: Implement SQLite schema**

Create `src/lib/runtime/storage/schema.ts`:

```ts
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

export type TRuntimeDatabase = import('better-sqlite3').Database;

interface IBetterSqlite3Constructor {
  new (dbPath: string): TRuntimeDatabase;
}

const requireOptional = createRequire(__filename);

export interface IOpenRuntimeDatabaseOptions {
  loadDatabase?: () => IBetterSqlite3Constructor;
}

export const CURRENT_RUNTIME_SCHEMA_VERSION = 1;

const RUNTIME_SCHEMA_V1 = `
create table if not exists schema_migrations (
  version integer primary key,
  applied_at text not null
);

create table if not exists workspaces (
  id text primary key,
  name text not null,
  default_cwd text not null,
  active integer not null default 0,
  group_id text null references workspace_groups(id) on delete set null,
  order_index integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists workspace_groups (
  id text primary key,
  name text not null,
  collapsed integer not null default 0,
  order_index integer not null,
  created_at text not null,
  updated_at text not null
);

create table if not exists panes (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  parent_id text null references panes(id) on delete cascade,
  node_kind text not null,
  split_axis text null,
  ratio real null,
  position integer not null,
  active_tab_id text null references tabs(id) on delete set null,
  created_at text not null,
  updated_at text not null
);

create table if not exists tabs (
  id text primary key,
  workspace_id text not null references workspaces(id) on delete cascade,
  pane_id text not null references panes(id) on delete cascade,
  session_name text not null unique,
  panel_type text not null,
  name text not null default '',
  title text null,
  cwd text null,
  lifecycle_state text not null default 'ready',
  failure_reason text null,
  order_index integer not null,
  terminal_ratio real null,
  terminal_collapsed integer not null default 0,
  web_url text null,
  last_command text null,
  created_at text not null,
  updated_at text not null
);

create table if not exists tab_status (
  tab_id text primary key references tabs(id) on delete cascade,
  cli_state text not null,
  current_process text null,
  pane_title text null,
  agent_session_id text null references agent_sessions(id) on delete set null,
  agent_jsonl_ref text null,
  agent_summary text null,
  last_user_message text null,
  last_assistant_message text null,
  current_action_json text null,
  ready_for_review_at integer null,
  busy_since integer null,
  dismissed_at integer null,
  last_event_json text null,
  event_seq integer not null default 0,
  updated_at text not null
);

create table if not exists mutation_events (
  id text primary key,
  command_id text null,
  actor text not null,
  entity_type text not null,
  entity_id text not null,
  event_type text not null,
  payload_json text not null,
  before_hash text null,
  after_hash text null,
  created_at text not null
);

create table if not exists status_events (
  id text primary key,
  tab_id text null references tabs(id) on delete set null,
  agent_session_id text null references agent_sessions(id) on delete set null,
  event_type text not null,
  payload_json text not null,
  source text not null,
  created_at text not null
);

create table if not exists agent_sessions (
  id text primary key,
  provider text not null,
  source text not null,
  source_id text null,
  cwd text null,
  jsonl_ref text null,
  started_at text null,
  last_activity_at text null,
  first_message text not null default '',
  turn_count integer not null default 0,
  summary text null,
  created_at text not null,
  updated_at text not null
);

create table if not exists remote_sources (
  id text primary key,
  source_label text not null,
  host text null,
  shell text null,
  latest_sync_at text null,
  latest_activity_at text null,
  latest_cwd text null,
  latest_remote_path text null,
  total_bytes integer not null default 0,
  updated_at text not null
);

create index if not exists idx_runtime_workspaces_group_order
  on workspaces(group_id, order_index, created_at);
create index if not exists idx_runtime_panes_workspace_parent_position
  on panes(workspace_id, parent_id, position);
create index if not exists idx_runtime_tabs_workspace_pane_order
  on tabs(workspace_id, pane_id, order_index);
create index if not exists idx_runtime_tabs_lifecycle_state_created_at
  on tabs(lifecycle_state, created_at);
create index if not exists idx_runtime_mutation_events_created_at
  on mutation_events(created_at);
create index if not exists idx_runtime_status_events_tab_created_at
  on status_events(tab_id, created_at);
create index if not exists idx_runtime_agent_sessions_provider_source
  on agent_sessions(provider, source_id);
create index if not exists idx_runtime_remote_sources_label_host
  on remote_sources(source_label, host);
`;

interface IRuntimeMigration {
  version: number;
  up: (db: TRuntimeDatabase) => void;
}

const RUNTIME_MIGRATIONS: IRuntimeMigration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(RUNTIME_SCHEMA_V1);
    },
  },
];

const hasSchemaMigrationsTable = (db: TRuntimeDatabase): boolean => {
  const row = db.prepare(`
    select 1 as present from sqlite_master
    where type = 'table' and name = 'schema_migrations'
  `).get() as { present: number } | undefined;
  return Boolean(row);
};

const readAppliedMigrationVersions = (db: TRuntimeDatabase): Set<number> => {
  if (!hasSchemaMigrationsTable(db)) return new Set();
  const rows = db.prepare(`select version from schema_migrations order by version`).all() as Array<{ version: number }>;
  return new Set(rows.map((row) => row.version));
};

export const runRuntimeMigrations = (db: TRuntimeDatabase): void => {
  const appliedVersions = readAppliedMigrationVersions(db);
  const maxAppliedVersion = Math.max(0, ...Array.from(appliedVersions));
  if (maxAppliedVersion > CURRENT_RUNTIME_SCHEMA_VERSION) {
    throw Object.assign(
      new Error(`Runtime v2 database schema version ${maxAppliedVersion} is newer than supported version ${CURRENT_RUNTIME_SCHEMA_VERSION}.`),
      {
        code: 'runtime-v2-schema-too-new',
        retryable: false,
      },
    );
  }

  for (const migration of RUNTIME_MIGRATIONS) {
    if (appliedVersions.has(migration.version)) continue;
    db.transaction(() => {
      migration.up(db);
      db.prepare(`insert into schema_migrations(version, applied_at) values(?, ?)`).run(
        migration.version,
        new Date().toISOString(),
      );
    })();
    appliedVersions.add(migration.version);
  }
};

const loadBetterSqlite3 = (): IBetterSqlite3Constructor => {
  try {
    return requireOptional('better-sqlite3') as IBetterSqlite3Constructor;
  } catch (err) {
    throw Object.assign(
      new Error('Runtime v2 requires optional dependency better-sqlite3. Install dependencies with native build support before enabling CODEXMUX_RUNTIME_V2=1.'),
      {
        code: 'runtime-v2-sqlite-unavailable',
        retryable: false,
        cause: err,
      },
    );
  }
};

export const openRuntimeDatabase = (
  dbPath: string,
  options: IOpenRuntimeDatabaseOptions = {},
): TRuntimeDatabase => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const Database = (options.loadDatabase ?? loadBetterSqlite3)();
  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  runRuntimeMigrations(db);
  return db;
};
```

- [ ] **Step 4: Implement repository**

Create `src/lib/runtime/storage/repository.ts`:

```ts
import type {
  IRuntimeCreateWorkspaceResult,
  IRuntimeDeleteWorkspaceStorageResult,
  IRuntimePendingTerminalTab,
  IRuntimeWorkspaceTerminalSession,
  IRuntimeTerminalTab,
  IRuntimeWorkspace,
  TRuntimeLayout,
} from '@/lib/runtime/contracts';
import type { ILayoutData, IPaneNode, ITab } from '@/types/terminal';
import { createRuntimeId } from '@/lib/runtime/session-name';
import type { TRuntimeDatabase } from '@/lib/runtime/storage/schema';

export interface ICreateWorkspaceInput {
  name: string;
  defaultCwd: string;
}

export interface ICreateTerminalTabInput {
  id: string;
  workspaceId: string;
  paneId: string;
  sessionName: string;
  cwd: string;
}

export interface IFinalizeTerminalTabInput {
  id: string;
}

export interface IFailPendingTerminalTabInput {
  id: string;
  reason: string;
}

export interface IDeleteWorkspaceInput {
  workspaceId: string;
}

export interface IMutationEventRow {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
}

const nowIso = (): string => new Date().toISOString();
const wsId = (): string => createRuntimeId('ws');
const paneId = (): string => createRuntimeId('pane');
const eventId = (): string => createRuntimeId('evt');

export const createStorageRepository = (db: TRuntimeDatabase) => {
  const appendMutationEvent = db.prepare(`
    insert into mutation_events (id, command_id, actor, entity_type, entity_id, event_type, payload_json, created_at)
    values (@id, @commandId, @actor, @entityType, @entityId, @eventType, @payloadJson, @createdAt)
  `);

  const recordEvent = (entityType: string, entityId: string, eventType: string, payload: unknown): void => {
    appendMutationEvent.run({
      id: eventId(),
      commandId: null,
      actor: 'runtime-v2',
      entityType,
      entityId,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso(),
    });
  };

  const createWorkspaceTx = db.transaction((input: ICreateWorkspaceInput): IRuntimeCreateWorkspaceResult => {
    const workspaceId = wsId();
    const rootPaneId = paneId();
    const ts = nowIso();

    db.prepare(`
      insert into workspaces (id, name, default_cwd, active, order_index, created_at, updated_at)
      values (?, ?, ?, 1, 0, ?, ?)
    `).run(workspaceId, input.name, input.defaultCwd, ts, ts);

    db.prepare(`
      insert into panes (id, workspace_id, node_kind, position, created_at, updated_at)
      values (?, ?, 'pane', 0, ?, ?)
    `).run(rootPaneId, workspaceId, ts, ts);

    recordEvent('workspace', workspaceId, 'workspace.created', input);
    return { id: workspaceId, rootPaneId };
  });

  const createPendingTerminalTabTx = db.transaction((input: ICreateTerminalTabInput): IRuntimePendingTerminalTab => {
    const id = input.id;
    const sessionName = input.sessionName;
    const ts = nowIso();
    const pane = db.prepare(`
      select workspace_id as workspaceId
      from panes
      where id = ?
    `).get(input.paneId) as { workspaceId: string } | undefined;
    if (!pane) {
      throw Object.assign(new Error(`runtime v2 pane not found: ${input.paneId}`), {
        code: 'runtime-v2-pane-not-found',
        retryable: false,
      });
    }
    if (pane.workspaceId !== input.workspaceId) {
      throw Object.assign(new Error(`runtime v2 pane does not belong to workspace: ${input.paneId}`), {
        code: 'runtime-v2-pane-workspace-mismatch',
        retryable: false,
      });
    }
    const nextOrder = (db.prepare(`
      select coalesce(max(order_index), -1) + 1 as nextOrder
      from tabs
      where pane_id = ?
    `).get(input.paneId) as { nextOrder: number }).nextOrder;

    db.prepare(`
      insert into tabs (id, workspace_id, pane_id, session_name, panel_type, name, cwd, lifecycle_state, order_index, created_at, updated_at)
      values (?, ?, ?, ?, 'terminal', '', ?, 'pending_terminal', ?, ?, ?)
    `).run(id, input.workspaceId, input.paneId, sessionName, input.cwd, nextOrder, ts, ts);

    recordEvent('tab', id, 'tab.create-pending', input);
    return {
      id,
      sessionName,
      workspaceId: input.workspaceId,
      paneId: input.paneId,
      cwd: input.cwd,
      lifecycleState: 'pending_terminal',
      createdAt: ts,
    };
  });

  const finalizeTerminalTabTx = db.transaction((input: IFinalizeTerminalTabInput): IRuntimeTerminalTab => {
    const ts = nowIso();
    const row = db.prepare(`
      select id, workspace_id as workspaceId, pane_id as paneId, session_name as sessionName, cwd, order_index as "order"
      from tabs
      where id = ? and lifecycle_state = 'pending_terminal'
    `).get(input.id) as { id: string; workspaceId: string; paneId: string; sessionName: string; cwd: string | null; order: number } | undefined;
    if (!row) {
      throw Object.assign(new Error(`pending terminal tab not found: ${input.id}`), {
        code: 'runtime-v2-pending-tab-not-found',
        retryable: false,
      });
    }

    db.prepare(`update tabs set lifecycle_state = 'ready', updated_at = ? where id = ?`)
      .run(ts, input.id);

    db.prepare(`update panes set active_tab_id = ?, updated_at = ? where id = ?`)
      .run(input.id, ts, row.paneId);

    db.prepare(`insert into tab_status (tab_id, cli_state, updated_at) values (?, 'inactive', ?)`)
      .run(input.id, ts);

    recordEvent('tab', input.id, 'tab.created', row);
    return { id: input.id, sessionName: row.sessionName, name: '', order: row.order, cwd: row.cwd ?? undefined, panelType: 'terminal', lifecycleState: 'ready' };
  });

  const failPendingTerminalTabTx = db.transaction((input: IFailPendingTerminalTabInput): void => {
    const ts = nowIso();
    const result = db.prepare(`
      update tabs
      set lifecycle_state = 'failed', failure_reason = ?, updated_at = ?
      where id = ? and lifecycle_state = 'pending_terminal'
    `).run(input.reason, ts, input.id);
    if (result.changes !== 1) {
      throw Object.assign(new Error(`pending terminal tab not found: ${input.id}`), {
        code: 'runtime-v2-pending-tab-not-found',
        retryable: false,
      });
    }
    recordEvent('tab', input.id, 'tab.create-failed', input);
  });

  const deleteWorkspaceTx = db.transaction((input: IDeleteWorkspaceInput): IRuntimeDeleteWorkspaceStorageResult => {
    const workspace = db.prepare(`select 1 as present from workspaces where id = ?`)
      .get(input.workspaceId) as { present: number } | undefined;
    if (!workspace) return { deleted: false, sessions: [] };

    const sessions = db.prepare(`
      select session_name as sessionName
      from tabs
      where workspace_id = ? and session_name is not null
        and lifecycle_state in ('pending_terminal', 'ready')
      order by created_at asc
    `).all(input.workspaceId) as IRuntimeWorkspaceTerminalSession[];
    const result = db.prepare(`delete from workspaces where id = ?`).run(input.workspaceId);
    if (result.changes === 0) return { deleted: false, sessions: [] };
    recordEvent('workspace', input.workspaceId, 'workspace.deleted', input);
    return { deleted: true, sessions };
  });

  return {
    createWorkspace: createWorkspaceTx,
    createPendingTerminalTab: createPendingTerminalTabTx,
    finalizeTerminalTab: finalizeTerminalTabTx,
    failPendingTerminalTab: failPendingTerminalTabTx,
    listPendingTerminalTabs(): IRuntimePendingTerminalTab[] {
      return db.prepare(`
        select id, session_name as sessionName, workspace_id as workspaceId, pane_id as paneId, cwd, lifecycle_state as lifecycleState, created_at as createdAt
        from tabs
        where lifecycle_state = 'pending_terminal'
        order by created_at asc
      `).all() as IRuntimePendingTerminalTab[];
    },
    getReadyTerminalTabBySession(sessionName: string): IRuntimeTerminalTab | null {
      const row = db.prepare(`
        select id, session_name as sessionName, name, order_index as "order", cwd, panel_type as panelType, lifecycle_state as lifecycleState
        from tabs
        where session_name = ? and panel_type = 'terminal' and lifecycle_state = 'ready'
      `).get(sessionName) as (IRuntimeTerminalTab & { cwd: string | null }) | undefined;
      if (!row) return null;
      return {
        id: row.id,
        sessionName: row.sessionName,
        name: row.name,
        order: row.order,
        ...(row.cwd ? { cwd: row.cwd } : {}),
        panelType: 'terminal',
        lifecycleState: 'ready',
      };
    },
    deleteWorkspace: deleteWorkspaceTx,

    getWorkspaceLayout(workspaceId: string): TRuntimeLayout {
      const pane = db.prepare(`select id, active_tab_id from panes where workspace_id = ? and parent_id is null`).get(workspaceId) as { id: string; active_tab_id: string | null } | undefined;
      if (!pane) return null;
      const tabs = db.prepare(`select id, session_name, name, order_index, cwd, panel_type from tabs where pane_id = ? and lifecycle_state = 'ready' order by order_index asc, created_at asc, id asc`).all(pane.id) as Array<{ id: string; session_name: string; name: string; order_index: number; cwd: string | null; panel_type: ITab['panelType'] }>;
      const root: IPaneNode = {
        type: 'pane',
        id: pane.id,
        activeTabId: pane.active_tab_id,
        tabs: tabs.map((tab) => ({
          id: tab.id,
          sessionName: tab.session_name,
          name: tab.name,
          order: tab.order_index,
          ...(tab.cwd ? { cwd: tab.cwd } : {}),
          ...(tab.panel_type ? { panelType: tab.panel_type } : {}),
        })),
      };
      return { root, activePaneId: pane.id, updatedAt: nowIso() };
    },

    listMutationEvents(): IMutationEventRow[] {
      return db.prepare(`select id, entity_type as entityType, entity_id as entityId, event_type as eventType from mutation_events order by created_at asc`).all() as IMutationEventRow[];
    },

    listWorkspaces(): IRuntimeWorkspace[] {
      return db.prepare(`
        select id, name, default_cwd as defaultCwd, active, group_id as groupId, order_index as orderIndex, created_at as createdAt, updated_at as updatedAt
        from workspaces
        order by order_index asc, created_at asc
      `).all() as IRuntimeWorkspace[];
    },
  };
};
```

- [ ] **Step 5: Run repository tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-repository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Record changed files and the storage repository test result. Do not commit
unless the user explicitly asks.

## Task 5: Storage Worker Service And Entrypoint

**Files:**
- Create: `src/lib/runtime/storage/worker-service.ts`
- Create: `src/workers/storage-worker.ts`
- Create: `tests/unit/lib/runtime/storage-worker-service.test.ts`

- [ ] **Step 1: Write Storage Worker service tests**

Create `tests/unit/lib/runtime/storage-worker-service.test.ts`:

```ts
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { createStorageWorkerService } from '@/lib/runtime/storage/worker-service';

describe('storage worker service', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-storage-worker-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('handles health and workspace creation commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });

    const health = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: {},
    }));

    expect(health.ok).toBe(true);
    expect(health.payload).toEqual({ ok: true });

    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));

    expect(created.ok).toBe(true);
    expect(created.payload).toEqual(expect.objectContaining({ id: expect.stringMatching(/^ws-/) }));
  });

  it('returns structured errors for invalid worker commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const unknown = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.unknown',
      payload: {},
    }));
    const wrongSource = await service.handleCommand(createRuntimeCommand({
      source: 'browser',
      target: 'storage',
      type: 'storage.health',
      payload: {},
    }));
    const wrongTarget = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'storage.health',
      payload: {},
    }));
    const wrongNamespace = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'terminal.health',
      payload: {},
    }));

    for (const reply of [unknown, wrongSource, wrongTarget, wrongNamespace]) {
      expect(reply.ok).toBe(false);
      expect(reply.error).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });

  it('handles pending terminal tab intent lifecycle commands', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };

    const pending = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    expect(pending.ok).toBe(true);
    expect(pending.payload).toEqual(expect.objectContaining({ lifecycleState: 'pending_terminal' }));

    const finalized = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    expect(finalized.ok).toBe(true);
    expect(finalized.payload).toEqual(expect.objectContaining({ id: 'tab-runtime', lifecycleState: 'ready' }));

    const finalizedAgain = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    expect(finalizedAgain.ok).toBe(false);
    expect(finalizedAgain.error).toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    });

    const missingFinalize = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-missing' },
    }));

    expect(missingFinalize.ok).toBe(false);
    expect(missingFinalize.error).toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    });
  });

  it('rejects terminal tab intents for panes outside the supplied workspace', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const other = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Other', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };
    const otherWorkspace = other.payload as { id: string; rootPaneId: string };

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: otherWorkspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${otherWorkspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatchObject({
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    });
  });

  it('deletes workspaces and returns cleanup sessions from the delete command', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`,
        cwd: dir,
      },
    }));

    const deleted = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.delete-workspace',
      payload: { workspaceId: workspace.id },
    }));
    expect(deleted.payload).toEqual({
      deleted: true,
      sessions: [{ sessionName: `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime` }],
    });
  });

  it('returns only ready terminal tabs for attach authorization', async () => {
    const service = createStorageWorkerService({ dbPath: path.join(dir, 'runtime-v2', 'state.db') });
    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-workspace',
      payload: { name: 'Runtime', defaultCwd: dir },
    }));
    const workspace = created.payload as { id: string; rootPaneId: string };
    const sessionName = `rtv2-${workspace.id}-${workspace.rootPaneId}-tab-runtime`;

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.create-pending-terminal-tab',
      payload: {
        id: 'tab-runtime',
        workspaceId: workspace.id,
        paneId: workspace.rootPaneId,
        sessionName,
        cwd: dir,
      },
    }));

    const pendingLookup = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.get-ready-terminal-tab-by-session',
      payload: { sessionName },
    }));
    expect(pendingLookup.payload).toBeNull();

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.finalize-terminal-tab',
      payload: { id: 'tab-runtime' },
    }));

    const readyLookup = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'storage.get-ready-terminal-tab-by-session',
      payload: { sessionName },
    }));
    expect(readyLookup.payload).toEqual(expect.objectContaining({ id: 'tab-runtime', lifecycleState: 'ready' }));
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-worker-service.test.ts
```

Expected: FAIL with missing `worker-service`.

- [ ] **Step 3: Implement Storage Worker service**

Create `src/lib/runtime/storage/worker-service.ts`:

```ts
import {
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import { createStorageRepository } from '@/lib/runtime/storage/repository';

export interface IStorageWorkerServiceOptions {
  dbPath: string;
}

export const createStorageWorkerService = (options: IStorageWorkerServiceOptions) => {
  const db = openRuntimeDatabase(options.dbPath);
  const repo = createStorageRepository(db);

  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'storage',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'storage', namespace: 'storage' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'storage.health') {
          return ok(command, { ok: true });
        }
        if (command.type === 'storage.create-workspace') {
          const input = parseRuntimeCommandPayload('storage.create-workspace', command.payload);
          return ok(command, repo.createWorkspace(input));
        }
        if (command.type === 'storage.create-pending-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.create-pending-terminal-tab', command.payload);
          return ok(command, repo.createPendingTerminalTab(input));
        }
        if (command.type === 'storage.finalize-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.finalize-terminal-tab', command.payload);
          return ok(command, repo.finalizeTerminalTab(input));
        }
        if (command.type === 'storage.fail-pending-terminal-tab') {
          const input = parseRuntimeCommandPayload('storage.fail-pending-terminal-tab', command.payload);
          repo.failPendingTerminalTab(input);
          return ok(command, { ok: true });
        }
        if (command.type === 'storage.list-pending-terminal-tabs') {
          return ok(command, repo.listPendingTerminalTabs());
        }
        if (command.type === 'storage.get-ready-terminal-tab-by-session') {
          const input = parseRuntimeCommandPayload('storage.get-ready-terminal-tab-by-session', command.payload);
          return ok(command, repo.getReadyTerminalTabBySession(input.sessionName));
        }
        if (command.type === 'storage.delete-workspace') {
          const input = parseRuntimeCommandPayload('storage.delete-workspace', command.payload);
          return ok(command, repo.deleteWorkspace(input));
        }
        if (command.type === 'storage.list-workspaces') {
          return ok(command, repo.listWorkspaces());
        }
        if (command.type === 'storage.get-layout') {
          const input = parseRuntimeCommandPayload('storage.get-layout', command.payload);
          return ok(command, repo.getWorkspaceLayout(input.workspaceId));
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported storage command: ${command.type}`,
          retryable: false,
        });
      } catch (err) {
        const maybeStructured = err as { code?: string; retryable?: boolean } | null;
        return fail(
          command,
          maybeStructured?.code ?? 'command-failed',
          err instanceof Error ? err.message : String(err),
          maybeStructured?.retryable ?? false,
        );
      }
    },

    close(): void {
      db.close();
    },
  };
};
```

- [ ] **Step 4: Implement Storage Worker entrypoint**

Create `src/workers/storage-worker.ts`:

```ts
import path from 'path';
import os from 'os';
import { createRuntimeReply, parseRuntimeMessage } from '@/lib/runtime/ipc';
import { createStorageWorkerService } from '@/lib/runtime/storage/worker-service';

const dbPath = process.env.CODEXMUX_RUNTIME_DB
  || path.join(process.env.HOME || os.homedir(), '.codexmux', 'runtime-v2', 'state.db');

const service = createStorageWorkerService({ dbPath });

process.on('message', async (raw) => {
  try {
    const msg = parseRuntimeMessage(raw);
    if (msg.kind !== 'command') return;
    const reply = await service.handleCommand(msg);
    process.send?.(reply);
  } catch (err) {
    const commandId = typeof raw === 'object' && raw && 'id' in raw && typeof raw.id === 'string' ? raw.id : null;
    if (!commandId) return;
    process.send?.(createRuntimeReply({
      commandId,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.invalid-command.reply',
      ok: false,
      payload: null,
      error: {
        code: 'invalid-worker-command',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      },
    }));
  }
});

process.on('disconnect', () => {
  service.close();
  process.exit(0);
});

process.on('SIGINT', () => {
  service.close();
  process.exit(0);
});
```

- [ ] **Step 5: Run Storage Worker tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/storage-worker-service.test.ts
```

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Record changed files and the Storage Worker service test result. Do not commit
unless the user explicitly asks.

## Task 6: Terminal Worker Service With Fake Runtime And Attach Events

**Files:**
- Create: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- Create: `src/lib/runtime/terminal/terminal-worker-service.ts`
- Create: `tests/unit/lib/runtime/terminal-worker-service.test.ts`
- Create: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`
- Create: `tests/integration/runtime-v2-terminal-process.test.ts`

- [ ] **Step 1: Write Terminal Worker service tests**

Create `tests/unit/lib/runtime/terminal-worker-service.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeCommand } from '@/lib/runtime/ipc';
import { createTerminalWorkerService, type ITerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-service';

const createFakeRuntime = (): ITerminalWorkerRuntime & { writes: string[]; detached: string[]; pushData?: (data: string) => void } => {
  const writes: string[] = [];
  const detached: string[] = [];
  const runtime: ITerminalWorkerRuntime & { writes: string[]; detached: string[]; pushData?: (data: string) => void } = {
    writes,
    detached,
    async health() {
      return { ok: true };
    },
    async createSession(input) {
      return { sessionName: input.sessionName, cols: input.cols, rows: input.rows };
    },
    async attach(sessionName, _cols, _rows, onData) {
      runtime.pushData = onData;
      onData('attached\n');
      return { sessionName, attached: true };
    },
    async detach(sessionName) {
      detached.push(sessionName);
      return { sessionName, detached: true };
    },
    async killSession(sessionName) {
      return { sessionName, killed: true };
    },
    async writeStdin(sessionName, data) {
      writes.push(`${sessionName}:${data}`);
      return { written: data.length };
    },
    async resize(sessionName, cols, rows) {
      return { sessionName, cols, rows };
    },
  };
  return runtime;
};

describe('terminal worker service', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates sessions and writes stdin', async () => {
    const runtime = createFakeRuntime();
    const service = createTerminalWorkerService({ runtime });

    const created = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.create-session',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24, cwd: '/tmp' },
    }));

    expect(created.ok).toBe(true);

    const written = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.write-stdin',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'pwd\n' },
    }));

    expect(written.ok).toBe(true);
    expect(runtime.writes).toEqual(['rtv2-ws-a-pane-b-tab-c:pwd\n']);
  });

  it('returns structured errors for invalid worker commands', async () => {
    const service = createTerminalWorkerService({ runtime: createFakeRuntime() });
    const unknown = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.unknown',
      payload: {},
    }));
    const wrongSource = await service.handleCommand(createRuntimeCommand({
      source: 'browser',
      target: 'terminal',
      type: 'terminal.health',
      payload: {},
    }));
    const wrongTarget = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'storage',
      type: 'terminal.health',
      payload: {},
    }));
    const wrongNamespace = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'storage.health',
      payload: {},
    }));

    for (const reply of [unknown, wrongSource, wrongTarget, wrongNamespace]) {
      expect(reply.ok).toBe(false);
      expect(reply.error).toMatchObject({
        code: 'invalid-worker-command',
        retryable: false,
      });
    }
  });

  it('preserves structured runtime errors', async () => {
    const runtime = createFakeRuntime();
    runtime.health = async () => {
      throw Object.assign(new Error('Runtime v2 tmux config is missing'), {
        code: 'runtime-v2-tmux-config-missing',
        retryable: false,
      });
    };
    const service = createTerminalWorkerService({ runtime });
    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.health',
      payload: {},
    }));

    expect(reply.ok).toBe(false);
    expect(reply.error).toMatchObject({
      code: 'runtime-v2-tmux-config-missing',
      retryable: false,
    });
  });

  it('rejects production tmux session names', async () => {
    const service = createTerminalWorkerService({ runtime: createFakeRuntime() });
    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'pt-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(false);
    expect(reply.error?.code).toBe('command-failed');
  });

  it('emits realtime stdout events for attached sessions', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const service = createTerminalWorkerService({
      runtime: createFakeRuntime(),
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(16);
    expect(events).toEqual([
      expect.objectContaining({
        kind: 'event',
        type: 'terminal.stdout',
        delivery: 'realtime',
        payload: expect.objectContaining({ sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'attached\n' }),
      }),
    ]);
  });

  it('coalesces stdout before emitting events', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('a');
      onData('b');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(true);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(16);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'terminal.stdout',
        payload: expect.objectContaining({ sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'ab' }),
      }),
    ]);
  });

  it('clears buffered stdout on detach without flushing stale output', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('partial');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      emitEvent: (event) => events.push(event),
    });

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));
    const detached = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.detach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c' },
    }));

    expect(detached.ok).toBe(true);
    expect(events).toEqual([]);
    await vi.advanceTimersByTimeAsync(16);
    expect(events).toEqual([]);
    expect(runtime.detached).toEqual(['rtv2-ws-a-pane-b-tab-c']);
    vi.useRealTimers();
  });

  it('ignores late stdout after detach', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      emitEvent: (event) => events.push(event),
    });

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));
    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.detach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c' },
    }));
    events.length = 0;

    runtime.pushData?.('late');
    await vi.advanceTimersByTimeAsync(16);

    expect(events).toEqual([]);
    vi.useRealTimers();
  });

  it('emits backpressure and detaches when stdout exceeds the pending byte cap', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('abcdef');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      maxPendingStdoutBytes: 4,
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    await Promise.resolve();
    expect(reply.ok).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({
        type: 'terminal.backpressure',
        payload: expect.objectContaining({
          sessionName: 'rtv2-ws-a-pane-b-tab-c',
          pendingBytes: 6,
          maxPendingStdoutBytes: 4,
        }),
      }),
    ]);
    expect(runtime.detached).toEqual(['rtv2-ws-a-pane-b-tab-c']);
    await vi.advanceTimersByTimeAsync(16);
    expect(events).toHaveLength(1);
    vi.useRealTimers();
  });

  it('drops buffered partial stdout when backpressure detaches', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('ab');
      onData('cde');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      maxPendingStdoutBytes: 4,
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(true);
    expect(events).toEqual([
      expect.objectContaining({ type: 'terminal.backpressure' }),
    ]);
    await vi.advanceTimersByTimeAsync(16);
    expect(events).toHaveLength(1);
    expect(events).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: 'terminal.stdout' }),
    ]));
    expect(runtime.detached).toEqual(['rtv2-ws-a-pane-b-tab-c']);
    vi.useRealTimers();
  });

  it('ignores late stdout after backpressure detach', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      runtime.pushData = onData;
      onData('abcdef');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      maxPendingStdoutBytes: 4,
      emitEvent: (event) => events.push(event),
    });

    await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));
    expect(events).toEqual([
      expect.objectContaining({ type: 'terminal.backpressure' }),
    ]);
    events.length = 0;

    runtime.pushData?.('late');
    await vi.advanceTimersByTimeAsync(16);

    expect(events).toEqual([]);
    vi.useRealTimers();
  });

  it('splits stdout frames without breaking multibyte characters', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('한글🙂abc');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      maxStdoutFrameBytes: 8,
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(16);
    const chunks = events.map((event) => (event as { payload: { data: string } }).payload.data);
    expect(chunks.join('')).toBe('한글🙂abc');
    expect(chunks.every((chunk) => !chunk.includes('\uFFFD'))).toBe(true);
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk).byteLength <= 8)).toBe(true);
  });

  it('coalesces multi-chunk Unicode stdout before Unicode-safe frame splitting', async () => {
    vi.useFakeTimers();
    const events: unknown[] = [];
    const runtime = createFakeRuntime();
    runtime.attach = async (sessionName, _cols, _rows, onData) => {
      onData('한');
      onData('글🙂');
      onData('abc');
      return { sessionName, attached: true };
    };
    const service = createTerminalWorkerService({
      runtime,
      stdoutFlushMs: 16,
      maxStdoutFrameBytes: 8,
      emitEvent: (event) => events.push(event),
    });

    const reply = await service.handleCommand(createRuntimeCommand({
      source: 'supervisor',
      target: 'terminal',
      type: 'terminal.attach',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 },
    }));

    expect(reply.ok).toBe(true);
    await vi.advanceTimersByTimeAsync(16);
    const chunks = events.map((event) => (event as { payload: { data: string } }).payload.data);
    expect(chunks.join('')).toBe('한글🙂abc');
    expect(chunks.every((chunk) => !chunk.includes('\uFFFD'))).toBe(true);
    expect(chunks.every((chunk) => Buffer.byteLength(chunk, 'utf8') <= 8)).toBe(true);
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run tests and confirm failure**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected: FAIL with missing terminal worker modules.

- [ ] **Step 3: Implement Terminal Worker service**

Create `src/lib/runtime/terminal/terminal-worker-service.ts`:

```ts
import {
  createRuntimeEvent,
  createRuntimeReply,
  parseRuntimeCommandPayload,
  type IRuntimeCommand,
  type IRuntimeEvent,
  type IRuntimeReply,
} from '@/lib/runtime/ipc';
import { validateWorkerCommandEnvelope, type IInvalidWorkerCommand } from '@/lib/runtime/worker-command-validation';

const DEFAULT_STDOUT_FLUSH_MS = 16;
const DEFAULT_MAX_PENDING_STDOUT_BYTES = 64 * 1024;
const DEFAULT_MAX_STDOUT_FRAME_BYTES = 16 * 1024;

export interface ITerminalWorkerRuntime {
  health(): Promise<unknown>;
  createSession(input: { sessionName: string; cols: number; rows: number; cwd?: string }): Promise<unknown>;
  attach(sessionName: string, cols: number, rows: number, onData: (data: string) => void): Promise<unknown>;
  detach(sessionName: string): Promise<unknown>;
  killSession(sessionName: string): Promise<unknown>;
  writeStdin(sessionName: string, data: string): Promise<unknown>;
  resize(sessionName: string, cols: number, rows: number): Promise<unknown>;
}

export interface ITerminalWorkerServiceOptions {
  runtime: ITerminalWorkerRuntime;
  emitEvent?: (event: IRuntimeEvent) => void;
  stdoutFlushMs?: number;
  maxPendingStdoutBytes?: number;
  maxStdoutFrameBytes?: number;
}

export const createTerminalWorkerService = (options: ITerminalWorkerServiceOptions) => {
  interface IStdoutBuffer {
    chunks: string[];
    bytes: number;
    timer: ReturnType<typeof setTimeout> | null;
  }

  const stdoutBuffers = new Map<string, IStdoutBuffer>();
  const attachedSessions = new Set<string>();
  const stdoutFlushMs = options.stdoutFlushMs ?? DEFAULT_STDOUT_FLUSH_MS;
  const maxPendingStdoutBytes = options.maxPendingStdoutBytes ?? DEFAULT_MAX_PENDING_STDOUT_BYTES;
  const maxStdoutFrameBytes = options.maxStdoutFrameBytes ?? DEFAULT_MAX_STDOUT_FRAME_BYTES;
  const byteLength = (value: string): number => Buffer.byteLength(value, 'utf8');

  const splitByByteLimit = (value: string): string[] => {
    const chunks: string[] = [];
    let current = '';
    let currentBytes = 0;

    for (const codePoint of value) {
      const codePointBytes = byteLength(codePoint);
      if (current && currentBytes + codePointBytes > maxStdoutFrameBytes) {
        chunks.push(current);
        current = '';
        currentBytes = 0;
      }

      if (codePointBytes > maxStdoutFrameBytes) {
        chunks.push(codePoint);
        continue;
      }

      current += codePoint;
      currentBytes += codePointBytes;
    }

    if (current) chunks.push(current);
    return chunks;
  };

  const emitStdout = (sessionName: string, data: string): void => {
    for (const chunk of splitByByteLimit(data)) {
      options.emitEvent?.(createRuntimeEvent({
        source: 'terminal',
        target: 'supervisor',
        type: 'terminal.stdout',
        delivery: 'realtime',
        payload: { sessionName, data: chunk },
      }));
    }
  };

  const flushStdout = (sessionName: string): void => {
    if (!attachedSessions.has(sessionName)) {
      clearStdout(sessionName);
      return;
    }
    const current = stdoutBuffers.get(sessionName);
    if (!current) return;
    if (current.timer) clearTimeout(current.timer);
    stdoutBuffers.delete(sessionName);
    const data = current.chunks.join('');
    if (data) emitStdout(sessionName, data);
  };

  const clearStdout = (sessionName: string): void => {
    const current = stdoutBuffers.get(sessionName);
    if (current?.timer) clearTimeout(current.timer);
    stdoutBuffers.delete(sessionName);
  };

  const appendStdout = (sessionName: string, data: string): void => {
    if (!attachedSessions.has(sessionName)) return;
    const bytes = byteLength(data);
    const current = stdoutBuffers.get(sessionName) ?? { chunks: [], bytes: 0, timer: null };
    if (current.bytes + bytes > maxPendingStdoutBytes) {
      attachedSessions.delete(sessionName);
      clearStdout(sessionName);
      options.emitEvent?.(createRuntimeEvent({
        source: 'terminal',
        target: 'supervisor',
        type: 'terminal.backpressure',
        delivery: 'realtime',
        payload: {
          sessionName,
          pendingBytes: current.bytes + bytes,
          maxPendingStdoutBytes,
        },
      }));
      void options.runtime.detach(sessionName).catch(() => {});
      return;
    }
    current.chunks.push(data);
    current.bytes += bytes;
    if (!current.timer) {
      current.timer = setTimeout(() => flushStdout(sessionName), stdoutFlushMs);
    }
    stdoutBuffers.set(sessionName, current);
  };

  const ok = <TPayload>(command: IRuntimeCommand, payload: TPayload): IRuntimeReply<TPayload> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'terminal',
      target: command.source,
      type: `${command.type}.reply`,
      ok: true,
      payload,
    });

  const fail = (command: IRuntimeCommand, code: string, message: string, retryable = false): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'terminal',
      target: command.source,
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error: { code, message, retryable },
    });

  const invalidCommand = (command: IRuntimeCommand, error: IInvalidWorkerCommand): IRuntimeReply<null> =>
    createRuntimeReply({
      commandId: command.id,
      source: 'terminal',
      target: 'supervisor',
      type: `${command.type}.reply`,
      ok: false,
      payload: null,
      error,
    });

  return {
    async handleCommand(command: IRuntimeCommand): Promise<IRuntimeReply> {
      const invalid = validateWorkerCommandEnvelope(command, { workerName: 'terminal', namespace: 'terminal' });
      if (invalid) return invalidCommand(command, invalid);
      try {
        if (command.type === 'terminal.health') {
          return ok(command, await options.runtime.health());
        }
        if (command.type === 'terminal.create-session') {
          return ok(command, await options.runtime.createSession(parseRuntimeCommandPayload('terminal.create-session', command.payload)));
        }
        if (command.type === 'terminal.attach') {
          const input = parseRuntimeCommandPayload('terminal.attach', command.payload);
          attachedSessions.add(input.sessionName);
          try {
            return ok(command, await options.runtime.attach(input.sessionName, input.cols, input.rows, (data) => {
              appendStdout(input.sessionName, data);
            }));
          } catch (err) {
            attachedSessions.delete(input.sessionName);
            clearStdout(input.sessionName);
            throw err;
          }
        }
        if (command.type === 'terminal.detach') {
          const input = parseRuntimeCommandPayload('terminal.detach', command.payload);
          attachedSessions.delete(input.sessionName);
          clearStdout(input.sessionName);
          return ok(command, await options.runtime.detach(input.sessionName));
        }
        if (command.type === 'terminal.write-stdin' || command.type === 'terminal.write-web-stdin') {
          const input = parseRuntimeCommandPayload(command.type, command.payload);
          return ok(command, await options.runtime.writeStdin(input.sessionName, input.data));
        }
        if (command.type === 'terminal.resize') {
          const input = parseRuntimeCommandPayload('terminal.resize', command.payload);
          return ok(command, await options.runtime.resize(input.sessionName, input.cols, input.rows));
        }
        if (command.type === 'terminal.kill-session') {
          const input = parseRuntimeCommandPayload('terminal.kill-session', command.payload);
          attachedSessions.delete(input.sessionName);
          clearStdout(input.sessionName);
          return ok(command, await options.runtime.killSession(input.sessionName));
        }
        return invalidCommand(command, {
          code: 'invalid-worker-command',
          message: `Unsupported terminal command: ${command.type}`,
          retryable: false,
        });
      } catch (err) {
        const maybeStructured = err as { code?: string; retryable?: boolean } | null;
        return fail(
          command,
          maybeStructured?.code ?? 'command-failed',
          err instanceof Error ? err.message : String(err),
          maybeStructured?.retryable ?? false,
        );
      }
    },
  };
};
```

- [ ] **Step 4: Implement minimal real runtime wrapper**

Create `src/lib/runtime/terminal/terminal-worker-runtime.ts`:

```ts
import { execFile as execFileCb } from 'child_process';
import * as pty from 'node-pty';
import { promisify } from 'util';
import { resolveRuntimeTmuxConfigPath } from '@/lib/runtime/worker-paths';
import { parseRuntimeSessionName } from '@/lib/runtime/session-name';
import { buildShellEnv, buildShellLaunchCommand } from '@/lib/shell-env';
import { PRISTINE_ENV } from '@/lib/pristine-env';
import type { ITerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-service';

const execFile = promisify(execFileCb);
const RUNTIME_TMUX_SOCKET = 'codexmux-runtime-v2';
const CMD_TIMEOUT = 5000;

interface IAttachedPty {
  pty: pty.IPty;
  disposables: pty.IDisposable[];
}

const assertRuntimeSessionName = (sessionName: string): void => {
  parseRuntimeSessionName(sessionName);
};

const createRuntimeError = (code: string, message: string, err: unknown): Error & { code: string; retryable: false } => (
  Object.assign(new Error(`${message}: ${err instanceof Error ? err.message : String(err)}`), {
    code,
    retryable: false as const,
  })
);

const sourceRuntimeTmuxConfig = async (): Promise<void> => {
  const tmuxConfigPath = resolveRuntimeTmuxConfigPath();
  try {
    await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'source-file', tmuxConfigPath], {
      timeout: CMD_TIMEOUT,
    });
  } catch (err) {
    throw createRuntimeError(
      'runtime-v2-tmux-config-source-failed',
      `Runtime v2 tmux config could not be sourced: ${tmuxConfigPath}`,
      err,
    );
  }
};

const createRuntimeSession = async (input: { sessionName: string; cols: number; rows: number; cwd?: string }): Promise<void> => {
  assertRuntimeSessionName(input.sessionName);
  await execFile(
    'tmux',
    [
      '-u',
      '-L',
      RUNTIME_TMUX_SOCKET,
      '-f',
      resolveRuntimeTmuxConfigPath(),
      'new-session',
      '-d',
      '-s',
      input.sessionName,
      '-x',
      String(input.cols),
      '-y',
      String(input.rows),
      buildShellLaunchCommand(),
    ],
    {
      timeout: CMD_TIMEOUT,
      cwd: input.cwd || PRISTINE_ENV.HOME || '/',
    },
  );
  try {
    await sourceRuntimeTmuxConfig();
  } catch (err) {
    await killRuntimeSession(input.sessionName);
    throw err;
  }
};

const killRuntimeSession = async (sessionName: string): Promise<void> => {
  assertRuntimeSessionName(sessionName);
  await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'kill-session', '-t', sessionName], {
    timeout: CMD_TIMEOUT,
  }).catch(() => {});
};

const assertRuntimeSessionExists = async (sessionName: string): Promise<void> => {
  assertRuntimeSessionName(sessionName);
  try {
    await execFile('tmux', ['-L', RUNTIME_TMUX_SOCKET, 'has-session', '-t', sessionName], {
      timeout: CMD_TIMEOUT,
    });
  } catch (err) {
    throw createRuntimeError(
      'runtime-v2-terminal-session-not-found',
      `Runtime v2 tmux session not found: ${sessionName}`,
      err,
    );
  }
};

export const createTerminalWorkerRuntime = (): ITerminalWorkerRuntime => {
  const attached = new Map<string, IAttachedPty>();

  const detachSession = async (sessionName: string) => {
    const current = attached.get(sessionName);
    if (!current) return { sessionName, detached: false };
    current.disposables.forEach((d) => d.dispose());
    current.pty.kill();
    attached.delete(sessionName);
    return { sessionName, detached: true };
  };

  return {
    async health() {
      return { ok: true, attached: attached.size };
    },

    async createSession(input) {
      await createRuntimeSession(input);
      return { sessionName: input.sessionName };
    },

    async attach(sessionName, cols, rows, onData) {
      assertRuntimeSessionName(sessionName);
      if (attached.has(sessionName)) return { sessionName, attached: true };
      await assertRuntimeSessionExists(sessionName);
      const ptyProcess = pty.spawn('tmux', ['-u', '-L', RUNTIME_TMUX_SOCKET, 'attach-session', '-t', sessionName], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: PRISTINE_ENV.HOME || '/',
        env: buildShellEnv(),
      });
      const disposables = [ptyProcess.onData(onData)];
      attached.set(sessionName, { pty: ptyProcess, disposables });
      return { sessionName, attached: true };
    },

    async detach(sessionName) {
      return detachSession(sessionName);
    },

    async killSession(sessionName) {
      await detachSession(sessionName);
      await killRuntimeSession(sessionName);
      return { sessionName, killed: true };
    },

    async writeStdin(sessionName, data) {
      const current = attached.get(sessionName);
      if (!current) throw new Error(`session is not attached: ${sessionName}`);
      current.pty.write(data);
      return { written: data.length };
    },

    async resize(sessionName, cols, rows) {
      const current = attached.get(sessionName);
      if (!current) throw new Error(`session is not attached: ${sessionName}`);
      current.pty.resize(cols, rows);
      return { sessionName, cols, rows };
    },
  };
};
```

This wrapper is intentionally minimal, but it must use `node-pty` inside
Terminal Worker for v2 attach/stdin/stdout/resize and must never attach to the
production `codexmux` tmux socket. First-slice stdout coalescing and byte caps
live in the Terminal Worker service; the next Terminal Worker hardening plan
will add reconnect recovery, lifecycle reconciliation, and full parity with the
old `/api/terminal` implementation. `kill-session` remains best-effort cleanup,
but tmux config `source-file` failure is fatal and must preserve
`runtime-v2-tmux-config-source-failed`. `createRuntimeSession()` self-cleans
partial creates: after `tmux new-session` succeeds, a later create-step failure
attempts `killRuntimeSession()` before rethrowing the original error. Supervisor
still keeps its create-tab rollback kill as a second cleanup attempt.

- [ ] **Step 4a: Add Terminal Worker runtime wrapper unit tests**

Create `tests/unit/lib/runtime/terminal-worker-runtime.test.ts` with mocked
`child_process.execFile`, `node-pty`, `resolveRuntimeTmuxConfigPath()`, and
shell helpers. Cover:

- `createSession()` rejects with `runtime-v2-tmux-config-source-failed` and
  `retryable: false` when `tmux source-file` fails after session creation,
  attempts best-effort `tmux kill-session`, and preserves the original source
  failure even if cleanup kill fails
- missing config from `resolveRuntimeTmuxConfigPath()` still surfaces
  `runtime-v2-tmux-config-missing`
- `killSession()` keeps `tmux kill-session` best-effort and resolves when tmux
  reports the session already gone
- `attach()` calls `tmux has-session` before `node-pty` spawn and rejects missing
  sessions with non-retryable `runtime-v2-terminal-session-not-found`

- [ ] **Step 4b: Add real tmux/node-pty process integration test**

Create `tests/integration/runtime-v2-terminal-process.test.ts`:

```ts
import { execFile as execFileCb } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { promisify } from 'util';
import { afterEach, describe, expect, it } from 'vitest';
import { createTerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-runtime';

const execFile = promisify(execFileCb);
const isLinux = process.platform === 'linux';
const describeOnLinux = isLinux ? describe : describe.skip;
const TEST_TIMEOUT_MS = 20_000;

const waitFor = async (read: () => string, predicate: (value: string) => boolean): Promise<string> => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    const value = read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for terminal output; got ${JSON.stringify(read().slice(-300))}`);
};

describeOnLinux('runtime v2 terminal process path', () => {
  const sessions: string[] = [];
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(sessions.map((sessionName) =>
      execFile('tmux', ['-L', 'codexmux-runtime-v2', 'kill-session', '-t', sessionName]).catch(() => undefined),
    ));
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    sessions.length = 0;
    tempDirs.length = 0;
  });

  it('creates, attaches, writes stdin, reads stdout, resizes, and kills a real v2 tmux session', async () => {
    await execFile('tmux', ['-V']).catch((err) => {
      throw new Error(`tmux is required for runtime v2 terminal integration test: ${err instanceof Error ? err.message : String(err)}`);
    });
    await import('node-pty').catch((err) => {
      throw new Error(`node-pty native binding is required for runtime v2 terminal integration test: ${err instanceof Error ? err.message : String(err)}`);
    });

    const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-v2-it-'));
    tempDirs.push(cwd);
    const sessionName = `rtv2-it-${process.pid}-${Date.now()}`;
    sessions.push(sessionName);
    const output: string[] = [];
    const runtime = createTerminalWorkerRuntime();

    await runtime.createSession({ sessionName, cols: 80, rows: 24, cwd });
    await runtime.attach(sessionName, 80, 24, (data) => output.push(data));
    await runtime.writeStdin(sessionName, 'pwd\n');
    await waitFor(() => output.join(''), (value) => value.includes(cwd));
    await runtime.resize(sessionName, 100, 30);
    await runtime.writeStdin(sessionName, 'printf runtime-v2-ok\\n\n');
    await waitFor(() => output.join(''), (value) => value.includes('runtime-v2-ok'));
    await expect(runtime.killSession(sessionName)).resolves.toMatchObject({ sessionName, killed: true });
  }, TEST_TIMEOUT_MS);
});
```

Expected: the test exercises the same runtime wrapper used by the Terminal Worker
entrypoint, with the isolated `codexmux-runtime-v2` tmux socket and an `rtv2-it-`
session name. On Linux, missing `tmux` or an unresolved `node-pty` native binding
is a hard test failure with a clear message. Linux CI must install `tmux`; the
test must use `describe.skip` only for `process.platform !== 'linux'`, not for a
missing Linux prerequisite. Non-Linux CI may skip this specific process-level
test, but platform smoke remains required separately.

- [ ] **Step 5: Run Terminal Worker service, runtime, and process tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/terminal-worker-service.test.ts
corepack pnpm vitest run tests/unit/lib/runtime/terminal-worker-runtime.test.ts
corepack pnpm vitest run tests/integration/runtime-v2-terminal-process.test.ts
```

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Record changed files and the Terminal Worker service plus process integration
test results. Do not commit unless the user explicitly asks.

## Task 7: Terminal Worker Entrypoint

**Files:**
- Create: `src/workers/terminal-worker.ts`

- [ ] **Step 1: Implement Terminal Worker entrypoint**

Create `src/workers/terminal-worker.ts`:

```ts
import { createRuntimeReply, parseRuntimeMessage } from '@/lib/runtime/ipc';
import { createTerminalWorkerRuntime } from '@/lib/runtime/terminal/terminal-worker-runtime';
import { createTerminalWorkerService } from '@/lib/runtime/terminal/terminal-worker-service';

const service = createTerminalWorkerService({
  runtime: createTerminalWorkerRuntime(),
  emitEvent: (event) => process.send?.(event),
});

process.on('message', async (raw) => {
  try {
    const msg = parseRuntimeMessage(raw);
    if (msg.kind !== 'command') return;
    const reply = await service.handleCommand(msg);
    process.send?.(reply);
  } catch (err) {
    const commandId = typeof raw === 'object' && raw && 'id' in raw && typeof raw.id === 'string' ? raw.id : null;
    if (!commandId) return;
    process.send?.(createRuntimeReply({
      commandId,
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.invalid-command.reply',
      ok: false,
      payload: null,
      error: {
        code: 'invalid-worker-command',
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
      },
    }));
  }
});

process.on('disconnect', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
```

- [ ] **Step 2: Run TypeScript**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS. If TypeScript reports missing `better-sqlite3` types, stop and rerun Task 1 before continuing.

- [ ] **Step 3: Run worker-related unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/worker-command-validation.test.ts tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/worker-client.test.ts tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected: PASS.

- [ ] **Step 4: Record checkpoint**

Record changed files and the worker entrypoint regression test result. Do not
commit unless the user explicitly asks.

## Task 8: Supervisor Runtime Service

**Files:**
- Create: `src/lib/runtime/supervisor.ts`
- Create: `src/lib/runtime/terminal-ws.ts`
- Create: `src/lib/runtime/server-ws-upgrade.ts`
- Create: `tests/unit/lib/runtime/supervisor.test.ts`
- Create: `tests/unit/lib/runtime/terminal-ws.test.ts`
- Create: `tests/unit/lib/runtime/server-ws-upgrade.test.ts`
- Modify: `server.ts`

- [ ] **Step 1: Write Supervisor orchestration tests**

Create `tests/unit/lib/runtime/supervisor.test.ts` with fake worker clients that
record command order. Cover these cases:

- `health()` waits for both `storage.health` and `terminal.health`.
- `listWorkspaces()` sends `storage.list-workspaces`.
- `deleteWorkspace()` sends one `storage.delete-workspace` command and uses the
  returned `sessions` from that Storage transaction as the only cleanup target.
  It must not call `storage.list-workspace-terminal-sessions`. If Storage delete
  fails, no `terminal.kill-session` command is sent. If tmux kill fails after
  Storage deletion succeeds, the result includes that session in `failedKills`.
- if `storage.delete-workspace` returns `{ deleted: false }`,
  `deleteWorkspace()` returns `{ deleted: false, killedSessions: [], failedKills: [] }`
  and does not close subscribers or send `terminal.kill-session`.
- after Storage delete succeeds, `deleteWorkspace()` treats invalid listed
  `sessionName` values as cleanup failures: it records the raw value in
  `failedKills`, skips subscriber close and `terminal.kill-session` for that
  value, and still returns the committed delete result. The
  `storage.delete-workspace` reply schema must allow raw string `sessionName`
  values so corrupt cleanup rows reach Supervisor's safe parser.
- after Storage delete succeeds, `deleteWorkspace()` closes existing subscribers
  for the deleted workspace's sessions with code `1000` and reason
  `Workspace deleted`, clears those subscriber map entries, waits for any
  in-flight attach attempt for that session to settle, and does not send
  `terminal.detach` for those closed subscribers.
- after closing deleted workspace subscribers, `deleteWorkspace()` does not cancel
  an already-sent `terminal.attach` IPC command. It waits for that attach attempt
  to settle through the existing bounded WorkerClient timeout path, then sends
  best-effort `terminal.kill-session` so a late attach is cleaned by kill.
- `createTerminalTab()` sends `storage.create-pending-terminal-tab` before
  `terminal.create-session`, then `storage.finalize-terminal-tab`.
- `createTerminalTab()` generates `sessionName` through
  `createRuntimeSessionName()` and never accepts a caller-supplied session name.
- unsafe or too-long workspace/pane ids cause `createTerminalTab()` to fail
  before Storage Worker or Terminal Worker commands are sent.
- workspace/pane mismatch in `createTerminalTab()` is rejected by
  `storage.create-pending-terminal-tab` with non-retryable
  `runtime-v2-pane-workspace-mismatch`, and no `terminal.create-session` command
  is sent.
- `attachTerminal()` first sends `storage.get-ready-terminal-tab-by-session` and
  rejects missing, pending, failed, or fabricated session names before
  `terminal.attach`.
- Terminal Worker `attach()` checks `tmux has-session` before spawning
  `node-pty`. If Storage still says `ready` but the tmux session is gone, attach
  fails with non-retryable `runtime-v2-terminal-session-not-found`. This first
  slice does not mutate the durable ready tab to failed on attach failure; that
  belongs to a later terminal lifecycle design.
- v2 WebSocket `MSG_KILL_SESSION` is unsupported in the first slice and must not
  send `terminal.kill-session`. Terminal Worker kill commands are covered only
  through internal cleanup paths that already enumerate or just created the
  target session: workspace deletion, pending-intent reconciliation, finalize
  failure rollback, and process integration cleanup.
- if `terminal.create-session` fails after the command has been sent,
  Supervisor sends best-effort `terminal.kill-session` and
  `storage.fail-pending-terminal-tab`.
- if `storage.finalize-terminal-tab` fails after the terminal create command was
  sent, Supervisor sends best-effort `terminal.kill-session` and
  `storage.fail-pending-terminal-tab`.
- if rollback `storage.fail-pending-terminal-tab` fails after terminal create or
  finalize failure, `createTerminalTab()` preserves and returns that Storage
  failure instead of swallowing it; any terminal kill stays best-effort.
- concurrent `ensureStarted()` calls start Storage Worker and Terminal Worker
  once, share the same in-flight start promise, and reconcile pending terminal
  intents once.
- `ensureStarted()` awaits `storage.waitUntilReady()`,
  `terminal.waitUntilReady()`, and pending-intent reconciliation before setting
  `started = true`.
- if either readiness check or startup reconciliation fails, `ensureStarted()`
  leaves `started = false`, shuts down any workers started during the attempt,
  clears the in-flight start promise, and a later `ensureStarted()` retries from
  a clean worker lifecycle.
- `ensureStarted()` reconciles stale pending terminal intents by killing the
  matching v2 tmux sessions best-effort and marking the intents failed in
  Storage.
- if a stale pending terminal intent has an invalid or unsafe `sessionName`,
  `ensureStarted()` skips `terminal.kill-session`, marks the pending intent
  failed in Storage, and does not treat the invalid name itself as fatal.
- if `storage.fail-pending-terminal-tab` fails during startup reconciliation,
  `ensureStarted()` fails, leaves `started = false`, shuts down partial workers,
  and retries the pending-intent reconciliation on the next call.
- `attachTerminal()` returns a `subscriberId`, supports multiple subscribers per
  session, and fans out `terminal.stdout` events to every subscriber for that
  session.
- `writeTerminal()` and `resizeTerminal()` require the caller's `subscriberId`
  and reject missing or already-detached subscribers with non-retryable
  `runtime-v2-terminal-subscriber-not-found` before sending
  `terminal.write-stdin` or `terminal.resize`.
- `attachTerminal()` sends `terminal.attach` only for the first subscriber of a
  session; after that attach succeeds, additional subscribers join Supervisor
  fanout without a duplicate Terminal Worker attach command.
- after a session is attached, additional subscriber attach query `cols`/`rows`
  are ignored for pty sizing. They do not send `terminal.resize`; only an
  explicit resize frame from an active subscriber calls `resizeTerminal()`, and
  the shared pty uses the last accepted resize.
- while the first `terminal.attach` for a session is in flight, later
  `attachTerminal()` calls join the same in-flight attach attempt and await its
  result before returning a `subscriberId`.
- in-flight `terminal.attach` failure rejects every `attachTerminal()` call that
  joined that attempt, removes every temporary subscriber from the attempt, sends
  best-effort `terminal.detach` if the attach command was sent, hides detach
  cleanup failure, preserves the original attach error, leaves no empty
  subscriber map entry, and does not leave the session counted as attached.
- adding a subscriber to an already-attached session succeeds without sending a
  second `terminal.attach`; subsequent `terminal.stdout` events are delivered to
  both subscribers.
- `terminal.backpressure` closes subscribers for that session with code `1011`
  and reason `Terminal output backpressure`.
- `/api/v2/terminal` registers close/error cleanup before awaiting
  `attachTerminal()`. If close/error fires while attach is pending and attach
  later succeeds, the handler detaches the returned `subscriberId` once and
  returns without accepting messages.
- `attachTerminal()` registers a close callback for Supervisor-owned terminal
  shutdown, and Terminal Worker exit closes attached sockets with code `1011`
  and reason `Terminal worker exited`.
- Terminal Worker exit clears the subscriber map and does not send
  `terminal.detach` for already-lost worker-owned attachments.
- after WorkerClient restart/readiness, a new `/api/v2/terminal` connection can
  attach the same `rtv2-` tmux session again through a fresh `terminal.attach`
  command.
- `detachTerminal()` removes only the supplied subscriber and sends
  `terminal.detach` only when the last subscriber for that session is gone.
- first detach from a multi-subscriber session does not send `terminal.detach`;
  the final detach sends exactly one `terminal.detach`. Duplicate
  `detachTerminal()` calls remain no-ops.
- user-facing WebSocket kill is rejected as unsupported and leaves Storage ready
  tab state unchanged.
- `CODEXMUX_RUNTIME_V2_RESET=1` renames any existing DB/WAL/SHM file to
  timestamped `.bak` files. The reset check is true if `state.db`,
  `state.db-wal`, or `state.db-shm` exists; it does not depend on the main DB
  file existing. Tests cover main-only, sidecar-only, and all-files-present
  cases.
- repeated `ensureStarted()` calls with `CODEXMUX_RUNTIME_V2_RESET=1` reuse the
  global prepared DB path and do not create additional backups.
- `getRuntimeSupervisor()` stores the singleton on `globalThis.__ptRuntimeSupervisor`.
- a simulated second module graph cannot create a second Supervisor or second
  worker-client pair when the global singleton already exists.

Expected: these tests fail until the Supervisor is implemented with injectable
worker-client factories or an exported test factory.

- [ ] **Step 2: Implement Supervisor singleton**

Create `src/lib/runtime/supervisor.ts`:

```ts
import path from 'path';
import os from 'os';
import fs from 'fs';
import type {
  IRuntimeCreateWorkspaceResult,
  IRuntimeDeleteWorkspaceResult,
  IRuntimeDeleteWorkspaceStorageResult,
  IRuntimeHealth,
  IRuntimeTerminalTab,
  IRuntimeWorkspace,
  TRuntimeLayout,
} from '@/lib/runtime/contracts';
import {
  createRuntimeId,
  createRuntimeSessionName,
  parseRuntimeSessionName,
} from '@/lib/runtime/session-name';
import { RuntimeWorkerClient } from '@/lib/runtime/worker-client';

interface IRuntimeSupervisor {
  ensureStarted(): Promise<void>;
  shutdown(): void;
  health(): Promise<IRuntimeHealth>;
  listWorkspaces(): Promise<IRuntimeWorkspace[]>;
  createWorkspace(input: { name: string; defaultCwd: string }): Promise<IRuntimeCreateWorkspaceResult>;
  deleteWorkspace(workspaceId: string): Promise<IRuntimeDeleteWorkspaceResult>;
  createTerminalTab(input: { workspaceId: string; paneId: string; cwd: string }): Promise<IRuntimeTerminalTab>;
  getLayout(workspaceId: string): Promise<TRuntimeLayout>;
  attachTerminal(input: {
    sessionName: string;
    cols: number;
    rows: number;
    send: (data: string) => void;
    close: (code: number, reason: string) => void;
  }): Promise<{ subscriberId: string }>;
  detachTerminal(input: { sessionName: string; subscriberId: string }): Promise<void>;
  writeTerminal(input: { sessionName: string; subscriberId: string; data: string }): Promise<void>;
  resizeTerminal(input: { sessionName: string; subscriberId: string; cols: number; rows: number }): Promise<void>;
}

interface IRuntimeSupervisorGlobalState {
  __ptRuntimeSupervisor?: IRuntimeSupervisor;
  __ptRuntimeSupervisorStartPromise?: Promise<void>;
  __ptRuntimeSupervisorPreparedDbPath?: string | null;
}

const g = globalThis as unknown as IRuntimeSupervisorGlobalState;

const getDbPath = (): string =>
  process.env.CODEXMUX_RUNTIME_DB || path.join(process.env.HOME || os.homedir(), '.codexmux', 'runtime-v2', 'state.db');

const runtimeDbFiles = (dbPath: string): string[] => [dbPath, `${dbPath}-wal`, `${dbPath}-shm`];

const hasRuntimeDbFiles = (dbPath: string): boolean =>
  runtimeDbFiles(dbPath).some((filePath) => fs.existsSync(filePath));

const backupRuntimeDbFiles = (dbPath: string): void => {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const filePath of runtimeDbFiles(dbPath)) {
    if (!fs.existsSync(filePath)) continue;
    fs.renameSync(filePath, `${filePath}.${stamp}.bak`);
  }
};

const prepareRuntimeDbPath = (): string => {
  if (g.__ptRuntimeSupervisorPreparedDbPath) return g.__ptRuntimeSupervisorPreparedDbPath;

  const dbPath = getDbPath();
  if (process.env.CODEXMUX_RUNTIME_V2_RESET === '1' && hasRuntimeDbFiles(dbPath)) {
    backupRuntimeDbFiles(dbPath);
  }
  g.__ptRuntimeSupervisorPreparedDbPath = dbPath;
  return g.__ptRuntimeSupervisorPreparedDbPath;
};

const tabId = (): string => createRuntimeId('tab');
const sessionNameFor = (workspaceId: string, paneId: string, tab: string): string =>
  createRuntimeSessionName({ workspaceId, paneId, tabId: tab });

export const getRuntimeSupervisor = (): IRuntimeSupervisor => {
  if (g.__ptRuntimeSupervisor) return g.__ptRuntimeSupervisor;

  interface ITerminalSubscriber {
    send: (data: string) => void;
    close: (code: number, reason: string) => void;
  }

  interface ITerminalAttachAttempt {
    subscriberIds: Set<string>;
    attachRequested: boolean;
    promise: Promise<void>;
  }

  const terminalSubscribers = new Map<string, Map<string, ITerminalSubscriber>>();
  const terminalAttachAttempts = new Map<string, ITerminalAttachAttempt>();
  let started = false;
  let reconciledPendingTerminalTabs = false;

  const getTerminalSubscriberCount = (sessionName: string): number =>
    terminalSubscribers.get(sessionName)?.size ?? 0;

  const addTerminalSubscriber = (sessionName: string, subscriber: ITerminalSubscriber): { subscriberId: string; shouldAttach: boolean } => {
    const subscriberId = createRuntimeId('sub');
    const sessionSubscribers = terminalSubscribers.get(sessionName) ?? new Map<string, ITerminalSubscriber>();
    const shouldAttach = sessionSubscribers.size === 0;
    sessionSubscribers.set(subscriberId, subscriber);
    terminalSubscribers.set(sessionName, sessionSubscribers);
    return { subscriberId, shouldAttach };
  };

  const removeTerminalSubscribers = (sessionName: string, subscriberIds: Iterable<string>): void => {
    const sessionSubscribers = terminalSubscribers.get(sessionName);
    if (!sessionSubscribers) return;
    for (const subscriberId of subscriberIds) {
      sessionSubscribers.delete(subscriberId);
    }
    if (sessionSubscribers.size === 0) terminalSubscribers.delete(sessionName);
  };

  const closeTerminalSubscribers = (sessionName: string, code: number, reason: string): void => {
    const sessionSubscribers = terminalSubscribers.get(sessionName);
    sessionSubscribers?.forEach((subscriber) => subscriber.close(code, reason));
    terminalSubscribers.delete(sessionName);
  };

  const waitForTerminalAttachAttempt = async (sessionName: string): Promise<void> => {
    await terminalAttachAttempts.get(sessionName)?.promise.catch(() => undefined);
  };

  const assertActiveTerminalSubscriber = (input: { sessionName: string; subscriberId: string }): string => {
    const sessionName = parseRuntimeSessionName(input.sessionName);
    if (terminalSubscribers.get(sessionName)?.has(input.subscriberId)) return sessionName;
    throw Object.assign(
      new Error(`runtime v2 terminal subscriber is not active: ${input.subscriberId}`),
      { code: 'runtime-v2-terminal-subscriber-not-found', retryable: false },
    );
  };

  const storage = new RuntimeWorkerClient({
    name: 'storage',
    workerName: 'storage-worker',
    readinessCommand: 'storage.health',
  });
  const terminal = new RuntimeWorkerClient({
    name: 'terminal',
    workerName: 'terminal-worker',
    readinessCommand: 'terminal.health',
    onEvent: (event) => {
      if (event.kind !== 'event') return;
      const payload = event.payload as { sessionName?: string; data?: string };
      if (!payload.sessionName) return;
      if (event.type === 'terminal.stdout') {
        if (typeof payload.data !== 'string') return;
        terminalSubscribers.get(payload.sessionName)?.forEach((subscriber) => subscriber.send(payload.data));
      }
      if (event.type === 'terminal.backpressure') {
        const sessionSubscribers = terminalSubscribers.get(payload.sessionName);
        sessionSubscribers?.forEach((subscriber) => subscriber.close(1011, 'Terminal output backpressure'));
        terminalSubscribers.delete(payload.sessionName);
      }
    },
    onExit: () => {
      for (const sessionSubscribers of terminalSubscribers.values()) {
        sessionSubscribers.forEach((subscriber) => subscriber.close(1011, 'Terminal worker exited'));
      }
      terminalSubscribers.clear();
    },
  });

  const assertReadyTerminalSession = async (sessionName: string): Promise<string> => {
    const parsedSessionName = parseRuntimeSessionName(sessionName);
    const tab = await storage.request<{ sessionName: string }, IRuntimeTerminalTab | null>(
      'storage.get-ready-terminal-tab-by-session',
      { sessionName: parsedSessionName },
    );
    if (!tab) {
      throw Object.assign(
        new Error(`runtime v2 terminal session is not ready: ${parsedSessionName}`),
        { code: 'runtime-v2-terminal-session-not-found', retryable: false },
      );
    }
    return parsedSessionName;
  };

  const parseRuntimeSessionNameOrNull = (sessionName: string): string | null => {
    try {
      return parseRuntimeSessionName(sessionName);
    } catch {
      return null;
    }
  };

  const reconcilePendingTerminalTabs = async (): Promise<void> => {
    if (reconciledPendingTerminalTabs) return;
    const pendingTabs = await storage.request<Record<string, never>, Array<{ id: string; sessionName: string }>>(
      'storage.list-pending-terminal-tabs',
      {},
    );
    for (const tab of pendingTabs) {
      const sessionName = parseRuntimeSessionNameOrNull(tab.sessionName);
      if (sessionName) {
        await terminal.request('terminal.kill-session', { sessionName }).catch(() => {});
      }
      await storage.request('storage.fail-pending-terminal-tab', {
        id: tab.id,
        reason: sessionName ? 'startup reconciliation' : 'startup reconciliation: invalid session name',
      });
    }
    reconciledPendingTerminalTabs = true;
  };

  const startInternal = async (): Promise<void> => {
    if (started) return;
    process.env.CODEXMUX_RUNTIME_DB = prepareRuntimeDbPath();
    try {
      storage.start();
      await storage.waitUntilReady();
      terminal.start();
      await terminal.waitUntilReady();
      await reconcilePendingTerminalTabs();
      started = true;
    } catch (err) {
      started = false;
      reconciledPendingTerminalTabs = false;
      terminal.shutdown();
      storage.shutdown();
      throw err;
    }
  };

  g.__ptRuntimeSupervisor = {
    async ensureStarted() {
      if (started) return;
      if (!g.__ptRuntimeSupervisorStartPromise) {
        g.__ptRuntimeSupervisorStartPromise = startInternal().catch((err) => {
          if (!started) g.__ptRuntimeSupervisorStartPromise = undefined;
          throw err;
        });
      }
      await g.__ptRuntimeSupervisorStartPromise;
    },

    shutdown() {
      terminal.shutdown();
      storage.shutdown();
      started = false;
      reconciledPendingTerminalTabs = false;
      g.__ptRuntimeSupervisorStartPromise = undefined;
    },

    async health() {
      await this.ensureStarted();
      const [storageHealth, terminalHealth] = await Promise.all([
        storage.request('storage.health', {}),
        terminal.request('terminal.health', {}),
      ]);
      return { ok: true, storage: storageHealth, terminal: terminalHealth };
    },

    async listWorkspaces() {
      await this.ensureStarted();
      return storage.request<Record<string, never>, IRuntimeWorkspace[]>('storage.list-workspaces', {});
    },

    async createWorkspace(input) {
      await this.ensureStarted();
      return storage.request<typeof input, IRuntimeCreateWorkspaceResult>('storage.create-workspace', input);
    },

    async deleteWorkspace(workspaceId) {
      await this.ensureStarted();
      const result = await storage.request<{ workspaceId: string }, IRuntimeDeleteWorkspaceStorageResult>(
        'storage.delete-workspace',
        { workspaceId },
      );
      if (!result.deleted) return { deleted: false, killedSessions: [], failedKills: [] };
      const killedSessions: string[] = [];
      const failedKills: Array<{ sessionName: string; error: string }> = [];
      for (const session of result.sessions) {
        const sessionName = parseRuntimeSessionNameOrNull(session.sessionName);
        if (!sessionName) {
          failedKills.push({
            sessionName: session.sessionName,
            error: 'invalid runtime session name',
          });
          continue;
        }
        closeTerminalSubscribers(sessionName, 1000, 'Workspace deleted');
        await waitForTerminalAttachAttempt(sessionName);
        try {
          await terminal.request('terminal.kill-session', { sessionName });
          killedSessions.push(sessionName);
        } catch (err) {
          failedKills.push({
            sessionName,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return { deleted: true, killedSessions, failedKills };
    },

    async createTerminalTab(input) {
      await this.ensureStarted();
      const id = tabId();
      const sessionName = sessionNameFor(input.workspaceId, input.paneId, id);
      const storageInput = { ...input, id, sessionName };
      await storage.request<typeof storageInput, { id: string; sessionName: string }>(
        'storage.create-pending-terminal-tab',
        storageInput,
      );
      let terminalCreateRequested = false;
      try {
        terminalCreateRequested = true;
        await terminal.request('terminal.create-session', {
          sessionName,
          cols: 80,
          rows: 24,
          cwd: input.cwd,
        });
        return await storage.request<{ id: string }, IRuntimeTerminalTab>('storage.finalize-terminal-tab', { id });
      } catch (err) {
        if (terminalCreateRequested) {
          await terminal.request('terminal.kill-session', { sessionName }).catch(() => {});
        }
        await storage.request('storage.fail-pending-terminal-tab', {
          id,
          reason: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },

    async getLayout(workspaceId) {
      await this.ensureStarted();
      return storage.request<{ workspaceId: string }, TRuntimeLayout>('storage.get-layout', { workspaceId });
    },

    async attachTerminal(input) {
      await this.ensureStarted();
      const sessionName = await assertReadyTerminalSession(input.sessionName);
      const existingAttachAttempt = terminalAttachAttempts.get(sessionName);
      const { subscriberId, shouldAttach } = addTerminalSubscriber(sessionName, {
        send: input.send,
        close: input.close,
      });
      const ownsAttachAttempt = !existingAttachAttempt && shouldAttach;
      const attachAttempt = existingAttachAttempt ?? (ownsAttachAttempt
        ? {
            subscriberIds: new Set<string>(),
            attachRequested: false,
            promise: Promise.resolve(),
          }
        : null);
      attachAttempt?.subscriberIds.add(subscriberId);
      if (ownsAttachAttempt && attachAttempt) {
        attachAttempt.promise = (async () => {
          attachAttempt.attachRequested = true;
          await terminal.request('terminal.attach', {
            sessionName,
            cols: input.cols,
            rows: input.rows,
          });
        })();
        terminalAttachAttempts.set(sessionName, attachAttempt);
      }
      try {
        await attachAttempt?.promise;
        return { subscriberId };
      } catch (err) {
        removeTerminalSubscribers(sessionName, attachAttempt?.subscriberIds ?? [subscriberId]);
        if (ownsAttachAttempt && attachAttempt?.attachRequested) {
          await terminal.request('terminal.detach', { sessionName }).catch(() => {});
        }
        throw err;
      } finally {
        if (ownsAttachAttempt && terminalAttachAttempts.get(sessionName) === attachAttempt) {
          terminalAttachAttempts.delete(sessionName);
        }
      }
    },

    async detachTerminal(input) {
      const sessionName = parseRuntimeSessionName(input.sessionName);
      const sessionSubscribers = terminalSubscribers.get(sessionName);
      if (!sessionSubscribers) return;
      sessionSubscribers?.delete(input.subscriberId);
      const remaining = getTerminalSubscriberCount(sessionName);
      if (remaining > 0) return;
      terminalSubscribers.delete(sessionName);
      await terminal.request('terminal.detach', { sessionName }).catch(() => {});
    },

    async writeTerminal(input) {
      await this.ensureStarted();
      const sessionName = assertActiveTerminalSubscriber(input);
      await terminal.request('terminal.write-stdin', {
        sessionName,
        data: input.data,
      });
    },

    async resizeTerminal(input) {
      await this.ensureStarted();
      const sessionName = assertActiveTerminalSubscriber(input);
      await terminal.request('terminal.resize', {
        sessionName,
        cols: input.cols,
        rows: input.rows,
      });
    },

  };

  return g.__ptRuntimeSupervisor;
};
```

Expose a small `createRuntimeSupervisorForTest()` or dependency-injected factory
so `tests/unit/lib/runtime/supervisor.test.ts` can pass fake storage and terminal
clients without forking real workers. `getRuntimeSupervisor()` remains the
production singleton backed by `globalThis.__ptRuntimeSupervisor`; the in-flight
start promise and prepared DB path also live on `globalThis` so the custom server
and Next API route module graphs cannot start duplicate workers or run reset
backup twice.

- [ ] **Step 3: Initialize runtime v2 from `server.ts` when enabled**

In `server.ts`, add imports:

```ts
import { getRuntimeSupervisor } from './src/lib/runtime/supervisor';
import {
  handleRuntimeTerminalConnection,
} from './src/lib/runtime/terminal-ws';
import {
  createWebSocketUpgradeHandler,
  type IRuntimeTerminalUpgradeContext,
} from './src/lib/runtime/server-ws-upgrade';
```

For `/api/v2/terminal`, use runtime v2 WebSocket auth before the old generic
terminal auth. The existing generic `verifyWebSocketAuth()` only accepts session
cookies, so Node smoke requests with `x-cmux-token` would be rejected if the
generic path ran first. Implement `routeWebSocketUpgrade()` and
`createWebSocketUpgradeHandler()` in `src/lib/runtime/server-ws-upgrade.ts`,
then import the factory from `server.ts`. The v2 branch must run before
`NO_AUTH_WS_PATHS` and before the generic `verifyWebSocketAuth()` call.

Create `src/lib/runtime/server-ws-upgrade.ts`:

```ts
import type { IncomingMessage } from 'http';
import type { Duplex } from 'stream';
import { verifyRuntimeV2WebSocketAuth } from '@/lib/runtime/api-auth';
import { parseRuntimeSessionName } from '@/lib/runtime/session-name';

const MAX_TERMINAL_COLS = 500;
const MAX_TERMINAL_ROWS = 200;
const DECIMAL_DIMENSION_RE = /^[1-9]\d*$/;

export interface IRuntimeTerminalUpgradeContext {
  sessionName: string;
  cols: number;
  rows: number;
}

export const parseTerminalDimension = (value: string | null, fallback: number, max: number): number => {
  if (value === null) return fallback;
  if (!DECIMAL_DIMENSION_RE.test(value)) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Math.min(parsed, max);
};

export interface IRouteWebSocketUpgradeOptions {
  request: IncomingMessage;
  socket: Duplex;
  head: Buffer;
  port: number;
  noAuthPaths: ReadonlySet<string>;
  wsPaths: ReadonlySet<string>;
  handleKnownUpgrade: (url: URL, request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  handleRuntimeTerminalUpgrade: (
    context: IRuntimeTerminalUpgradeContext,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
  fallbackUpgrade: (request: IncomingMessage, socket: Duplex, head: Buffer) => void;
  verifyRuntimeAuth?: typeof verifyRuntimeV2WebSocketAuth;
  verifyGenericAuth: (request: IncomingMessage) => Promise<boolean>;
  runtimeEnabled?: () => boolean;
}

export interface ICreateWebSocketUpgradeHandlerOptions {
  port: number;
  noAuthPaths: ReadonlySet<string>;
  wsPaths: ReadonlySet<string>;
  handleKnownUpgrade: IRouteWebSocketUpgradeOptions['handleKnownUpgrade'];
  handleRuntimeTerminalUpgrade: IRouteWebSocketUpgradeOptions['handleRuntimeTerminalUpgrade'];
  fallbackUpgrade: IRouteWebSocketUpgradeOptions['fallbackUpgrade'];
  verifyGenericAuth: IRouteWebSocketUpgradeOptions['verifyGenericAuth'];
  isRequestAllowed: (remoteAddress: string | undefined) => boolean;
  rejectSocket: (socket: Duplex) => void;
  onUpgradeError?: (error: unknown) => void;
  routeUpgrade?: (options: IRouteWebSocketUpgradeOptions) => void | Promise<void>;
}

const safeDestroySocket = (socket: Duplex): void => {
  try {
    if (!socket.destroyed) socket.destroy();
  } catch (destroyErr) {
    void destroyErr;
  }
};

const writeUpgradeJsonError = (
  socket: Duplex,
  statusCode: number,
  reason: string,
  body: Record<string, string>,
): void => {
  const payload = JSON.stringify(body);
  const headers = [
    `HTTP/1.1 ${statusCode} ${reason}`,
    'Content-Type: application/json',
    `Content-Length: ${Buffer.byteLength(payload, 'utf8')}`,
    'Connection: close',
  ];
  const response = `${headers.join('\r\n')}\r\n\r\n${payload}`;
  try {
    socket.end(response);
  } catch {
    safeDestroySocket(socket);
  }
};

const verifyUpgradeAuth = async (
  verifyAuth: (request: IncomingMessage) => Promise<boolean>,
  request: IncomingMessage,
): Promise<boolean> => {
  try {
    return await verifyAuth(request);
  } catch {
    return false;
  }
};

const hasInvalidRawRequestTargetChars = (rawUrl: string): boolean => /[#\u0000-\u0020\u007f-\u{10ffff}]/u.test(rawUrl);

const hasMalformedPercentEncoding = (rawUrl: string): boolean => /%(?![0-9A-Fa-f]{2})/.test(rawUrl);

const hasEncodedPathDelimiter = (rawUrl: string): boolean => /%(?:2[fF]|5[cC])/.test(rawUrl.split('?')[0] ?? '');

const isOriginFormRequestTarget = (rawUrl: string): boolean => rawUrl.startsWith('/') && !rawUrl.startsWith('//');

const isRuntimeV2WebSocketNamespace = (pathname: string): boolean => pathname === '/api/v2' || pathname.startsWith('/api/v2/');

const getSingleSearchParam = (searchParams: URLSearchParams, name: string): string | null => {
  const values = searchParams.getAll(name);
  return values.length === 1 ? values[0] : null;
};

export const routeWebSocketUpgrade = async ({
  request,
  socket,
  head,
  port,
  noAuthPaths,
  wsPaths,
  handleKnownUpgrade,
  handleRuntimeTerminalUpgrade,
  fallbackUpgrade,
  verifyRuntimeAuth = verifyRuntimeV2WebSocketAuth,
  verifyGenericAuth,
  runtimeEnabled = () => process.env.CODEXMUX_RUNTIME_V2 === '1',
}: IRouteWebSocketUpgradeOptions): Promise<void> => {
  const rawUrl = typeof request.url === 'string' ? request.url : '';
  if (
    rawUrl.length === 0 ||
    hasInvalidRawRequestTargetChars(rawUrl) ||
    hasMalformedPercentEncoding(rawUrl) ||
    hasEncodedPathDelimiter(rawUrl) ||
    !isOriginFormRequestTarget(rawUrl)
  ) {
    writeUpgradeJsonError(socket, 400, 'Bad Request', { error: 'invalid-websocket-url' });
    return;
  }

  let url: URL;
  try {
    url = new URL(rawUrl, `http://localhost:${port}`);
  } catch {
    writeUpgradeJsonError(socket, 400, 'Bad Request', { error: 'invalid-websocket-url' });
    return;
  }

  if (isRuntimeV2WebSocketNamespace(url.pathname) && url.pathname !== '/api/v2/terminal') {
    writeUpgradeJsonError(socket, 404, 'Not Found', { error: 'runtime-v2-upgrade-not-found' });
    return;
  }

  if (url.pathname === '/api/v2/terminal') {
    if (!runtimeEnabled()) {
      writeUpgradeJsonError(socket, 404, 'Not Found', { error: 'runtime-v2-disabled' });
      return;
    }

    if (!(await verifyUpgradeAuth(verifyRuntimeAuth, request))) {
      writeUpgradeJsonError(socket, 401, 'Unauthorized', { error: 'Unauthorized' });
      return;
    }

    const rawSessionName = getSingleSearchParam(url.searchParams, 'session');
    if (!rawSessionName) {
      writeUpgradeJsonError(socket, 400, 'Bad Request', { error: 'invalid-runtime-v2-terminal-session' });
      return;
    }

    let sessionName: string;
    try {
      sessionName = parseRuntimeSessionName(rawSessionName);
    } catch {
      writeUpgradeJsonError(socket, 400, 'Bad Request', { error: 'invalid-runtime-v2-terminal-session' });
      return;
    }

    handleRuntimeTerminalUpgrade({
      sessionName,
      cols: parseTerminalDimension(getSingleSearchParam(url.searchParams, 'cols'), 80, MAX_TERMINAL_COLS),
      rows: parseTerminalDimension(getSingleSearchParam(url.searchParams, 'rows'), 24, MAX_TERMINAL_ROWS),
    }, request, socket, head);
    return;
  }

  if (noAuthPaths.has(url.pathname)) {
    handleKnownUpgrade(url, request, socket, head);
    return;
  }

  if (!(await verifyUpgradeAuth(verifyGenericAuth, request))) {
    writeUpgradeJsonError(socket, 401, 'Unauthorized', { error: 'Unauthorized' });
    return;
  }

  if (wsPaths.has(url.pathname)) {
    handleKnownUpgrade(url, request, socket, head);
    return;
  }

  fallbackUpgrade(request, socket, head);
};

export const createWebSocketUpgradeHandler = ({
  port,
  noAuthPaths,
  wsPaths,
  handleKnownUpgrade,
  handleRuntimeTerminalUpgrade,
  fallbackUpgrade,
  verifyGenericAuth,
  isRequestAllowed,
  rejectSocket,
  onUpgradeError,
  routeUpgrade = routeWebSocketUpgrade,
}: ICreateWebSocketUpgradeHandlerOptions) => {
  return async (request: IncomingMessage, socket: Duplex, head: Buffer): Promise<void> => {
    try {
      if (!isRequestAllowed(request.socket.remoteAddress)) {
        rejectSocket(socket);
        return;
      }

      await routeUpgrade({
        request,
        socket,
        head,
        port,
        noAuthPaths,
        wsPaths,
        verifyGenericAuth,
        handleKnownUpgrade,
        handleRuntimeTerminalUpgrade,
        fallbackUpgrade,
      });
    } catch (err) {
      try {
        onUpgradeError?.(err);
      } catch (loggingErr) {
        void loggingErr;
      }
      safeDestroySocket(socket);
    }
  };
};
```

The dev upgrade handler registers the factory-created handler:

```ts
server.on('upgrade', createWebSocketUpgradeHandler({
  port,
  noAuthPaths: NO_AUTH_WS_PATHS,
  wsPaths: WS_PATHS,
  verifyGenericAuth: verifyWebSocketAuth,
  handleKnownUpgrade: (url, req, upgradeSocket, upgradeHead) => {
    handleWsUpgrade(wsServers, req, upgradeSocket, upgradeHead, url);
  },
  handleRuntimeTerminalUpgrade: (context, req, upgradeSocket, upgradeHead) => {
    wsServers.runtimeTerminalWss.handleUpgrade(req, upgradeSocket, upgradeHead, (ws) => {
      wsServers.runtimeTerminalWss.emit('connection', ws, req, context);
    });
  },
  fallbackUpgrade: upgrade,
  isRequestAllowed,
  rejectSocket,
  onUpgradeError: (err) => {
    log.error(`websocket upgrade failed: ${err instanceof Error ? err.message : err}`);
  },
}));
```

The prod upgrade handler uses the same factory and injects the proxy
fallback:

```ts
server.on('upgrade', createWebSocketUpgradeHandler({
  port,
  noAuthPaths: NO_AUTH_WS_PATHS,
  wsPaths: WS_PATHS,
  verifyGenericAuth: verifyWebSocketAuth,
  handleKnownUpgrade: (url, req, upgradeSocket, upgradeHead) => {
    handleWsUpgrade(wsServers, req, upgradeSocket, upgradeHead, url);
  },
  handleRuntimeTerminalUpgrade: (context, req, upgradeSocket, upgradeHead) => {
    wsServers.runtimeTerminalWss.handleUpgrade(req, upgradeSocket, upgradeHead, (ws) => {
      wsServers.runtimeTerminalWss.emit('connection', ws, req, context);
    });
  },
  fallbackUpgrade: (req, upgradeSocket, upgradeHead) => proxyUpgrade(req, upgradeSocket, upgradeHead, internalPort),
  isRequestAllowed,
  rejectSocket,
  onUpgradeError: (err) => {
    log.error(`websocket upgrade failed: ${err instanceof Error ? err.message : err}`);
  },
}));
```

The helper accepts session cookie or `x-cmux-token` header during upgrade and
explicitly rejects the shared case-insensitive query credential denylist.
`server.ts` imports runtime modules through `./src/...` paths; the helper file
itself lives under `src/`, so it uses normal `@/` imports.

Browser, Electron, and Android WebView clients use the session cookie by opening
a relative WebSocket URL. The Node smoke script is the only first-slice client
that sends `x-cmux-token` through WebSocket headers. Do not support credential
query parameters such as `?token=...`, `?x-cmux-token=...`, `?authorization=...`,
or `?access_token=...`.

Add `/api/v2/terminal` to `WS_PATHS` as a known upgrade path, but keep the v2
terminal branch inside `routeWebSocketUpgrade()` before the generic `wsPaths`
branch. The v2 route must not use the old `handleConnection` path.

```ts
const WS_PATHS = new Set(['/api/terminal', '/api/timeline', '/api/sync', '/api/status', '/api/install', '/api/v2/terminal']);
```

Keep `handleWsUpgrade()` as the legacy known-path dispatcher. It receives the
already parsed `URL` from `routeWebSocketUpgrade()` and must not call
`new URL()` or contain the `/api/v2/terminal` session parsing branch:

```ts
const handleWsUpgrade = (
  { wss, timelineWss, syncWss, statusWss, installWss }: ReturnType<typeof createWsServers>,
  request: IncomingMessage,
  socket: import('stream').Duplex,
  head: Buffer,
  url: URL,
) => {
  if (url.pathname === '/api/terminal') {
    const sessionId = url.searchParams.get('session');
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, sessionId);
    });
  } else if (url.pathname === '/api/timeline') {
    timelineWss.handleUpgrade(request, socket, head, (ws) => {
      timelineWss.emit('connection', ws, request);
    });
  } else if (url.pathname === '/api/sync') {
    syncWss.handleUpgrade(request, socket, head, (ws) => {
      syncWss.emit('connection', ws);
    });
  } else if (url.pathname === '/api/status') {
    statusWss.handleUpgrade(request, socket, head, (ws) => {
      statusWss.emit('connection', ws);
    });
  } else if (url.pathname === '/api/install') {
    installWss.handleUpgrade(request, socket, head, (ws) => {
      installWss.emit('connection', ws, request);
    });
  }
};
```

Create `src/lib/runtime/terminal-ws.ts`. It uses the existing binary terminal
protocol, but routes all terminal ownership through Supervisor and Terminal
Worker:

```ts
import WebSocket from 'ws';
import {
  MSG_HEARTBEAT,
  MSG_KILL_SESSION,
  MSG_RESIZE,
  MSG_STDIN,
  MSG_WEB_STDIN,
  decodeMessage,
  encodeStdout,
  textDecoder,
} from '@/lib/terminal-protocol';

const toArrayBuffer = (raw: WebSocket.RawData): ArrayBuffer => {
  if (raw instanceof ArrayBuffer) return raw;
  const buffer = Buffer.isBuffer(raw) ? raw : Buffer.concat(raw as Buffer[]);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};

const rawByteLength = (raw: WebSocket.RawData): number => {
  if (raw instanceof ArrayBuffer) return raw.byteLength;
  if (Buffer.isBuffer(raw)) return raw.byteLength;
  return (raw as Buffer[]).reduce((total, chunk) => total + chunk.byteLength, 0);
};

const MAX_QUEUED_INPUT_FRAMES = 256;
const MAX_QUEUED_INPUT_BYTES = 1024 * 1024;
const MAX_TERMINAL_COLS = 500;
const MAX_TERMINAL_ROWS = 200;

export interface IRuntimeTerminalContext {
  sessionName: string;
  cols: number;
  rows: number;
}

export interface IRuntimeTerminalSupervisor {
  attachTerminal(input: {
    sessionName: string;
    cols: number;
    rows: number;
    send: (data: string) => void;
    close: (code: number, reason: string) => void;
  }): Promise<{ subscriberId: string }>;
  detachTerminal(input: { sessionName: string; subscriberId: string }): Promise<void>;
  writeTerminal(input: { sessionName: string; subscriberId: string; data: string }): Promise<void>;
  resizeTerminal(input: { sessionName: string; subscriberId: string; cols: number; rows: number }): Promise<void>;
}

export const handleRuntimeTerminalConnection = async (
  ws: WebSocket,
  context: IRuntimeTerminalContext,
  supervisor: IRuntimeTerminalSupervisor,
): Promise<void> => {
  const { sessionName, cols, rows } = context;
  const closeAttachedSocket = (code: number, reason: string): void => {
    if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
  };

  let subscriberId: string | null = null;
  let closedBeforeAttach = ws.readyState !== WebSocket.OPEN;
  let detached = false;
  const detach = (): void => {
    if (!subscriberId) {
      closedBeforeAttach = true;
      return;
    }
    if (detached) return;
    detached = true;
    supervisor.detachTerminal({ sessionName, subscriberId }).catch(() => {});
  };

  ws.on('close', detach);
  ws.on('error', detach);

  try {
    const attachment = await supervisor.attachTerminal({
      sessionName,
      cols,
      rows,
      send: (data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(encodeStdout(data));
      },
      close: closeAttachedSocket,
    });
    subscriberId = attachment.subscriberId;
    if (closedBeforeAttach || ws.readyState !== WebSocket.OPEN) {
      detach();
      return;
    }
  } catch (err) {
    closeAttachedSocket(1011, err instanceof Error ? err.message : 'Runtime terminal attach failed');
    return;
  }
  const activeSubscriberId = subscriberId;

  const handleMessage = async (raw: WebSocket.RawData): Promise<void> => {
    if (detached) return;
    try {
      const msg = decodeMessage(toArrayBuffer(raw));
      switch (msg.type) {
        case MSG_STDIN:
        case MSG_WEB_STDIN:
          await supervisor.writeTerminal({ sessionName, subscriberId: activeSubscriberId, data: textDecoder.decode(msg.payload) });
          break;
        case MSG_RESIZE: {
          if (msg.payload.length < 4) break;
          const view = new DataView(msg.payload.buffer, msg.payload.byteOffset, msg.payload.byteLength);
          const newCols = view.getUint16(0);
          const newRows = view.getUint16(2);
          if (newCols > 0 && newRows > 0) {
            await supervisor.resizeTerminal({
              sessionName,
              subscriberId: activeSubscriberId,
              cols: Math.min(newCols, MAX_TERMINAL_COLS),
              rows: Math.min(newRows, MAX_TERMINAL_ROWS),
            });
          }
          break;
        }
        case MSG_HEARTBEAT:
          if (ws.readyState === WebSocket.OPEN) ws.send(new Uint8Array([MSG_HEARTBEAT]));
          break;
        case MSG_KILL_SESSION:
          throw Object.assign(new Error('Runtime v2 WebSocket kill is unsupported in the first slice'), {
            code: 'runtime-v2-kill-unsupported',
            retryable: false,
          });
      }
    } catch (err) {
      closeAttachedSocket(1011, err instanceof Error ? err.message : 'Runtime terminal command failed');
      detach();
    }
  };

  let queuedFrames = 0;
  let queuedBytes = 0;
  let messageQueue = Promise.resolve();
  ws.on('message', (raw) => {
    if (detached) return;
    const byteLength = rawByteLength(raw);
    if (
      queuedFrames >= MAX_QUEUED_INPUT_FRAMES
      || queuedBytes + byteLength > MAX_QUEUED_INPUT_BYTES
    ) {
      closeAttachedSocket(1011, 'Terminal input backpressure');
      detach();
      return;
    }
    queuedFrames += 1;
    queuedBytes += byteLength;
    messageQueue = messageQueue
      .then(async () => {
        try {
          await handleMessage(raw);
        } finally {
          queuedFrames -= 1;
          queuedBytes -= byteLength;
        }
      })
      .catch(() => undefined);
  });
};
```

Inside `createWsServers()`, create `runtimeTerminalWss` with `noServer: true`,
wire the connection callback, and include it in the returned server set:

```ts
  const runtimeTerminalWss = new WebSocketServer({ noServer: true });
  runtimeTerminalWss.on('connection', (ws, _request, context) => {
    void handleRuntimeTerminalConnection(
      ws,
      context as IRuntimeTerminalUpgradeContext,
      getRuntimeSupervisor(),
    );
  });

  return { wss, timelineWss, syncWss, statusWss, installWss, runtimeTerminalWss };
```

When Terminal Worker exits while a socket is attached, Supervisor's `onExit`
callback closes that socket with code `1011` and reason
`Terminal worker exited`, clears the subscriber map, and does not replay stdout.
After WorkerClient restart/readiness succeeds, browser recovery is a fresh
`/api/v2/terminal` connection that sends a new `terminal.attach` for the same
v2 tmux session.

Create `tests/unit/lib/runtime/terminal-ws.test.ts` with a fake WebSocket event
emitter and fake Supervisor. Cover:

- attach success sends `encodeStdout(data)` when Supervisor calls the registered
  send callback
- `MSG_STDIN` and `MSG_WEB_STDIN` call `writeTerminal` with the returned
  `subscriberId`
- valid `MSG_RESIZE` calls `resizeTerminal` with the returned `subscriberId`;
  short resize payload is ignored
- invalid `cols`/`rows` query values, including `1e2`, `0x10`, signed numbers,
  decimals, zero, leading-zero values, empty strings, and decoded whitespace,
  attach with default `80x24`; oversized decimal query values clamp to `500x200`
- a second WebSocket subscriber with different attach query dimensions does not
  call `resizeTerminal` during attach; only its later explicit `MSG_RESIZE`
  changes the shared pty size, after `subscriberId` authorization
- oversized `MSG_RESIZE` values clamp to `500x200`; zero and short resize
  payloads are ignored
- `MSG_HEARTBEAT` echoes a heartbeat frame
- `MSG_KILL_SESSION` closes the socket with code `1011` and
  `runtime-v2-kill-unsupported`/unsupported copy, and does not send
  `terminal.kill-session`
- `close` detaches only the returned `subscriberId`
- `close` followed by `error` detaches once, not twice
- close/error while `attachTerminal()` is pending registers before attach
  resolves; if attach later succeeds, the handler detaches the returned
  `subscriberId` exactly once and returns without accepting messages
- no cancellation is sent for an already-sent `terminal.attach`; when every
  subscriber waiting on an in-flight attach closes and attach later succeeds, the
  handlers remove all returned subscribers and Terminal Worker receives exactly
  one final `terminal.detach`
- write or resize command failures, including
  `runtime-v2-terminal-subscriber-not-found`, close the socket with code `1011`
- two rapid stdin frames are processed in receive order and call
  `writeTerminal` sequentially
- after the first queued message fails and detaches the socket, later queued
  stdin/resize frames are no-ops and do not call Supervisor or Terminal Worker
- exceeding 256 queued frames or 1 MiB of queued raw payload closes the socket
  with code `1011` and reason `Terminal input backpressure`, detaches once, and
  does not pass overflow frames to Supervisor or Terminal Worker
- attach failure closes the socket with code `1011`, including a Supervisor
  rejection for a fabricated or non-ready `rtv2-` session name
- Supervisor close callback from Terminal Worker exit closes the socket with
  code `1011` and reason `Terminal worker exited`
- after a Terminal Worker exit close, creating a new WebSocket connection calls
  `attachTerminal()` again and does not reuse the old subscriber id

Create `tests/unit/lib/runtime/server-ws-upgrade.test.ts` for the exported
`routeWebSocketUpgrade()` helper without importing `server.ts`. Tests must prove `/api/v2/terminal` runs
`verifyRuntimeV2WebSocketAuth()` before the generic cookie-only
`verifyWebSocketAuth()` path, and that an `x-cmux-token` header is accepted for
the v2 terminal route without a session cookie. Use the helper's injected
`verifyRuntimeAuth` and `verifyGenericAuth` options to assert call order and
non-calls directly. Also cover disabled
`CODEXMUX_RUNTIME_V2` returning `404 runtime-v2-disabled` before either auth
helper or `runtimeTerminalWss.handleUpgrade()` runs, plus invalid `session`
query values such as `rtv2-a:b`, duplicate `session` parameters, and too-long names returning
`400 invalid-runtime-v2-terminal-session` before
`runtimeTerminalWss.handleUpgrade()` runs. Missing, empty, and malformed request
URLs, including absolute-form URLs (`http://evil.test/api/v2/terminal?...`),
protocol-relative URLs (`//evil.test/api/v2/terminal?...`), authority-form
targets (`evil.test:443`), asterisk-form targets (`*`), raw spaces, tabs,
newlines, null bytes, DEL, raw hash fragments such as
`/api/v2/terminal#x?session=rtv2-a` or
`/api/v2/terminal?session=rtv2-a#frag`, malformed percent escapes such as
`/api/v2/terminal%`, `/api/v2/terminal?session=rtv2-a%`,
`/api/v2/terminal?session=rtv2-a%2`, and
`/api/v2/terminal?session=rtv2-a%GG`, encoded path delimiters such as
`/api%2Fv2%2Fterminal?session=rtv2-a`, `/api/v2%2Fterminal?session=rtv2-a`,
and `/api/v2%5Cterminal?session=rtv2-a`, whitespace-only,
whitespace-padded, and internally whitespace-containing values, plus raw non-ASCII paths or queries such as
`/api/v2/terminal/한글` and `/api/v2/terminal/😀`, return
`400 invalid-websocket-url` before runtime/generic auth,
`handleKnownUpgrade()`, `handleRuntimeTerminalUpgrade()`, or fallback runs.
Well-formed percent-encoded whitespace, hash, or UTF-8 such as `%20`, `%23`,
`%ED%95%9C%EA%B8%80`, or `%F0%9F%98%80` is not a raw invalid request-target
character and remains allowed when the rest of the origin-form URL is valid.
Well-formed `%2F` or `%5C` remains rejected in the path because downstream
layers may normalize it as a delimiter; `%2F` or `%5C` in query values is not
rejected by this path-delimiter guard.
Runtime v2 namespace paths other than the exact `/api/v2/terminal` WebSocket
route, including `/api/v2`, `/api/v2?x=1`, `/api/v2/terminal/`,
`/api/v2/runtime/health`, and `/api/v2/unknown`, return
`404 runtime-v2-upgrade-not-found` before
runtime/generic auth, `handleKnownUpgrade()`, `handleRuntimeTerminalUpgrade()`,
or fallback runs.
Valid legacy upgrade requests pass the single parsed `URL` from
`routeWebSocketUpgrade()` into the injected `handleKnownUpgrade()` callback, and
valid v2 terminal upgrade requests pass the parsed session/dimensions into the
injected `handleRuntimeTerminalUpgrade()` callback. The upgrade helper owns
attach query dimension parsing and must not import `terminal-ws.ts`; tests should
cover invalid dimension defaults and oversized dimension clamping through
`routeWebSocketUpgrade()` or its exported parser. Invalid attach query dimensions
include `1e2`, `0x10`, signed numbers, decimals, zero, leading-zero values such
as `080`, empty strings, decoded whitespace values such as `%2080%20`, and
duplicate `cols` or `rows` parameters. Duplicated `cols` falls back to `80` while
leaving a single valid `rows` intact; duplicated `rows` falls back to `24` while
leaving a single valid `cols` intact.
`handleWsUpgrade()` remains
covered only through thin server wiring tests and must not call `new URL()`
again. Runtime auth throw and generic auth throw both return
`401 Unauthorized` through `writeUpgradeJsonError()` and do not call
`handleUpgrade()` or fallback. Successful `socket.end(response)` must not call
`safeDestroySocket()`; if `socket.end()` throws, the helper calls
`safeDestroySocket()`, and if `socket.destroy()` also throws the helper still
does not throw. Do not export or directly unit-test `safeDestroySocket()`; cover
that behavior through public `routeWebSocketUpgrade()` failure paths. The
single-query-param helper remains private; do not add direct unit tests for its
duplicate-vs-missing reason. Cover missing, empty, and duplicated `session`
through the shared `400 invalid-runtime-v2-terminal-session` outcome, and cover
duplicated `cols`/`rows` through independent dimension fallback outcomes. The
upgrade tests must assert `writeUpgradeJsonError()` output for
`404 runtime-v2-disabled`, `404 runtime-v2-upgrade-not-found`, `401 Unauthorized`,
`400 invalid-runtime-v2-terminal-session`, and `400 invalid-websocket-url`,
including JSON body, `Content-Type`, exact `Content-Length`, `Connection: close`,
the `\r\n\r\n{"error":...}` header/body separator, `socket.end(response)`, and
no `handleUpgrade()` call on failures. In the same test file, route/parser cases
may import `routeWebSocketUpgrade()`, `parseTerminalDimension()`, and the public
option types. Factory cases should use only `createWebSocketUpgradeHandler()`
plus an injected `routeUpgrade`. Do not import `server.ts` or
`safeDestroySocket()`. Factory cases prove disallowed remote addresses call `rejectSocket()` without routing,
allowed requests call the injected `routeUpgrade()` with the configured
auth/routing callbacks, and the configured fallback is forwarded by identity.
The injected `routeUpgrade` type accepts `void | Promise<void>` so tests can use
sync throwing fixtures or async rejecting fixtures. Prove both a sync-thrown
`routeUpgrade` and an async-rejected `routeUpgrade`
call `onUpgradeError()` and destroy an undestroyed socket, thrown
`isRequestAllowed()` and thrown `rejectSocket()` follow the same fail-close path,
an already destroyed socket is not double-destroyed, `onUpgradeError` throwing
does not prevent socket cleanup or reject the listener promise, `socket.destroy()`
throwing does not reject the listener promise, and the top-level catch does not
write a JSON upgrade response. Cover these through
`createWebSocketUpgradeHandler()` public behavior, not by exporting
`safeDestroySocket()`. The dev/prod `server.ts` snippets must pass `upgrade` in dev and
`(req, socket, head) => proxyUpgrade(req, socket, head, internalPort)` in prod.

After `await initSessionIndexService();` add:

```ts
  if (process.env.CODEXMUX_RUNTIME_V2 === '1') {
    void getRuntimeSupervisor().ensureStarted().catch((err) => {
      log.error(`runtime v2 supervisor failed to start: ${err instanceof Error ? err.message : err}`);
    });
  }
```

Inside both `shutdown` functions in `startDev` and `startProd`, before `await shutdownWs();`, add:

```ts
    if (process.env.CODEXMUX_RUNTIME_V2 === '1') {
      getRuntimeSupervisor().shutdown();
    }
```

- [ ] **Step 4: Run TypeScript**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 5: Run Supervisor and terminal WebSocket tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/terminal-ws.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts
```

Expected: PASS.

- [ ] **Step 6: Record checkpoint**

Record changed files and the Supervisor/terminal WebSocket/server upgrade test
results. Do not commit unless the user explicitly asks.

## Task 9: API v2 Skeleton And Terminal WebSocket

**Files:**
- Create: `src/lib/runtime/api-auth.ts`
- Create: `tests/unit/lib/runtime/api-auth.test.ts`
- Create: `src/lib/runtime/api-handler.ts`
- Create: `tests/unit/lib/runtime/api-handler.test.ts`
- Create: `tests/unit/pages/runtime-v2-api.test.ts`
- Create: `src/pages/api/v2/runtime/health.ts`
- Create: `src/pages/api/v2/workspaces/index.ts`
- Create: `src/pages/api/v2/workspaces/[workspaceId]/index.ts`
- Create: `src/pages/api/v2/workspaces/[workspaceId]/layout.ts`
- Create: `src/pages/api/v2/tabs/index.ts`

- [ ] **Step 1: Add runtime v2 API auth helper**

Create `src/lib/runtime/api-auth.ts`:

```ts
import type { NextApiRequest } from 'next';
import type { IncomingMessage } from 'http';
import { SESSION_COOKIE, extractCookie, verifySessionToken } from '@/lib/auth';
import { verifyTokenValue } from '@/lib/cli-token';

const hasForbiddenQueryCredential = (rawUrl: string | undefined): boolean => {
  const forbidden = new Set([
    'token',
    'x-cmux-token',
    'authorization',
    'auth',
    'api_key',
    'apikey',
    'access_token',
    'session-token',
  ]);
  try {
    const url = new URL(rawUrl ?? '/', 'http://localhost');
    return Array.from(url.searchParams.keys()).some((key) => forbidden.has(key.toLowerCase()));
  } catch {
    return true;
  }
};

export const verifyRuntimeV2ApiAuth = async (req: NextApiRequest): Promise<boolean> => {
  if (hasForbiddenQueryCredential(req.url)) return false;

  const cliToken = req.headers['x-cmux-token'];
  if (typeof cliToken === 'string' && verifyTokenValue(cliToken)) return true;

  const cookieToken = extractCookie(req.headers.cookie ?? '', SESSION_COOKIE);
  if (!cookieToken) return false;
  return !!(await verifySessionToken(cookieToken));
};

export const verifyRuntimeV2WebSocketAuth = async (request: IncomingMessage): Promise<boolean> => {
  if (hasForbiddenQueryCredential(request.url)) return false;

  const cliToken = request.headers['x-cmux-token'];
  if (typeof cliToken === 'string' && verifyTokenValue(cliToken)) return true;

  const cookieToken = extractCookie(request.headers.cookie ?? '', SESSION_COOKIE);
  if (!cookieToken) return false;
  return !!(await verifySessionToken(cookieToken));
};
```

Create `tests/unit/lib/runtime/api-auth.test.ts` with mocked `verifyTokenValue`
and `verifySessionToken`:

```ts
import { describe, expect, it, vi } from 'vitest';
import type { IncomingMessage } from 'http';
import type { NextApiRequest } from 'next';
import { verifyRuntimeV2ApiAuth, verifyRuntimeV2WebSocketAuth } from '@/lib/runtime/api-auth';

vi.mock('@/lib/cli-token', () => ({
  verifyTokenValue: vi.fn((value: string) => value === 'valid-cli-token'),
}));

vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    ...actual,
    verifySessionToken: vi.fn(async (value: string) => value === 'valid-session-token' ? { sub: 'user' } : null),
  };
});

const req = (headers: Record<string, string>, url = '/api/v2/runtime/health'): NextApiRequest =>
  ({ headers, url } as NextApiRequest);
const wsReq = (headers: Record<string, string>, url = '/api/v2/terminal?session=rtv2-a'): IncomingMessage =>
  ({ headers, url } as IncomingMessage);

describe('runtime v2 api auth', () => {
  it('accepts x-cmux-token', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({ 'x-cmux-token': 'valid-cli-token' }))).resolves.toBe(true);
  });

  it('accepts the session cookie', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({ cookie: 'session-token=valid-session-token' }))).resolves.toBe(true);
  });

  it('rejects missing credentials', async () => {
    await expect(verifyRuntimeV2ApiAuth(req({}))).resolves.toBe(false);
  });

  it('rejects credential query parameters before header or cookie auth', async () => {
    const forbiddenNames = [
      'token',
      'x-cmux-token',
      'authorization',
      'auth',
      'api_key',
      'apikey',
      'access_token',
      'session-token',
      'ToKeN',
    ];

    for (const name of forbiddenNames) {
      await expect(verifyRuntimeV2ApiAuth(req(
        { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
        `/api/v2/runtime/health?${name}=valid-cli-token`,
      ))).resolves.toBe(false);
    }
  });

  it('fails closed for malformed request URLs', async () => {
    await expect(verifyRuntimeV2ApiAuth(req(
      { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
      'http://[::1',
    ))).resolves.toBe(false);
  });
});

describe('runtime v2 websocket auth', () => {
  it('accepts session cookie for browser websocket clients', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq({ cookie: 'session-token=valid-session-token' }))).resolves.toBe(true);
  });

  it('accepts x-cmux-token for node smoke websocket clients', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq({ 'x-cmux-token': 'valid-cli-token' }))).resolves.toBe(true);
  });

  it('rejects credential query parameters but allows the terminal session query', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq(
      { cookie: 'session-token=valid-session-token' },
      '/api/v2/terminal?session=rtv2-a',
    ))).resolves.toBe(true);

    for (const name of ['token', 'authorization', 'API_KEY', 'access_token', 'session-token']) {
      await expect(verifyRuntimeV2WebSocketAuth(wsReq(
        { cookie: 'session-token=valid-session-token' },
        `/api/v2/terminal?session=rtv2-a&${name}=valid-cli-token`,
      ))).resolves.toBe(false);
    }
  });

  it('fails closed for malformed websocket request URLs', async () => {
    await expect(verifyRuntimeV2WebSocketAuth(wsReq(
      { 'x-cmux-token': 'valid-cli-token', cookie: 'session-token=valid-session-token' },
      'http://[::1',
    ))).resolves.toBe(false);
  });
});
```

- [ ] **Step 2: Add runtime v2 API handler helpers**

Create `src/lib/runtime/api-handler.ts`:

```ts
import type { NextApiResponse } from 'next';
import { ZodError, type ZodSchema } from 'zod';

export class RuntimeApiValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(issues.join(', '));
    this.name = 'RuntimeApiValidationError';
  }
}

export const parseRuntimeApiBody = <T>(schema: ZodSchema<T>, value: unknown): T => {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new RuntimeApiValidationError(parsed.error.issues.map((issue) => issue.message));
};

export const sendRuntimeDisabled = (res: NextApiResponse): void => {
  res.status(404).json({ error: 'runtime-v2-disabled' });
};

const runtimeErrorStatusByCode: Record<string, number> = {
  'runtime-v2-pane-not-found': 404,
  'runtime-v2-pending-tab-not-found': 404,
  'runtime-v2-terminal-session-not-found': 404,
  'runtime-v2-terminal-subscriber-not-found': 404,
  'runtime-v2-pane-workspace-mismatch': 409,
  'runtime-v2-sqlite-unavailable': 500,
  'runtime-v2-worker-script-missing': 500,
  'runtime-v2-tmux-config-missing': 500,
  'runtime-v2-tmux-config-source-failed': 500,
  'runtime-v2-schema-too-new': 500,
};

export const sendRuntimeApiError = (res: NextApiResponse, err: unknown): void => {
  if (err instanceof RuntimeApiValidationError || err instanceof ZodError) {
    res.status(400).json({ error: 'invalid-runtime-v2-request', message: err.message });
    return;
  }

  if (err && typeof err === 'object' && 'code' in err) {
    const code = String((err as { code: unknown }).code);
    const retryable = Boolean((err as { retryable?: unknown }).retryable);
    const message = err instanceof Error ? err.message : code;
    if (retryable || code === 'worker-exited' || code === 'worker-error') {
      res.status(503).json({ error: code, message, retryable: true });
      return;
    }
    res.status(runtimeErrorStatusByCode[code] ?? 500).json({ error: code, message });
    return;
  }

  res.status(500).json({
    error: 'runtime-v2-error',
    message: err instanceof Error ? err.message : String(err),
  });
};
```

Create `tests/unit/lib/runtime/api-handler.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError } from '@/lib/runtime/api-handler';

const res = () => {
  const target = {
    status: vi.fn(() => target),
    json: vi.fn(() => target),
  };
  return target;
};

describe('runtime v2 api handler helpers', () => {
  it('parses valid input and throws a validation error for invalid input', () => {
    const schema = z.object({ workspaceId: z.string().min(1) });
    expect(parseRuntimeApiBody(schema, { workspaceId: 'ws-a' })).toEqual({ workspaceId: 'ws-a' });
    expect(() => parseRuntimeApiBody(schema, { workspaceId: '' })).toThrow();
  });

  it('maps validation errors to 400', () => {
    const r = res();
    try {
      parseRuntimeApiBody(z.object({ paneId: z.string().min(1) }), { paneId: '' });
    } catch (err) {
      sendRuntimeApiError(r as never, err);
    }
    expect(r.status).toHaveBeenCalledWith(400);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid-runtime-v2-request' }));
  });

  it('maps retryable worker failures to 503', () => {
    const r = res();
    sendRuntimeApiError(r as never, Object.assign(new Error('storage worker exited'), {
      code: 'worker-exited',
      retryable: true,
    }));
    expect(r.status).toHaveBeenCalledWith(503);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ retryable: true }));
  });

  it('maps terminal worker command failures to retryable 503 before WebSocket upgrade', () => {
    const r = res();
    sendRuntimeApiError(r as never, Object.assign(new Error('terminal worker exited'), {
      code: 'worker-exited',
      retryable: true,
    }));
    expect(r.status).toHaveBeenCalledWith(503);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'worker-exited',
      retryable: true,
    }));
  });

  it('maps worker overload to 503', () => {
    const r = res();
    sendRuntimeApiError(r as never, Object.assign(new Error('storage worker overloaded'), {
      code: 'worker-overloaded',
      retryable: true,
    }));
    expect(r.status).toHaveBeenCalledWith(503);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'worker-overloaded', retryable: true }));
  });

  it('maps non-retryable domain errors to explicit status codes', () => {
    const r = res();
    sendRuntimeApiError(r as never, Object.assign(new Error('pane does not belong to workspace'), {
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    }));
    expect(r.status).toHaveBeenCalledWith(409);
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'runtime-v2-pane-workspace-mismatch',
      message: 'pane does not belong to workspace',
    }));
    expect(r.json).not.toHaveBeenCalledWith(expect.objectContaining({ retryable: true }));
  });

  it('maps missing runtime resources to 404', () => {
    for (const code of [
      'runtime-v2-pending-tab-not-found',
      'runtime-v2-terminal-session-not-found',
      'runtime-v2-terminal-subscriber-not-found',
    ]) {
      const r = res();
      sendRuntimeApiError(r as never, Object.assign(new Error(code), {
        code,
        retryable: false,
      }));
      expect(r.status).toHaveBeenCalledWith(404);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: code }));
    }
  });

  it('maps runtime startup/configuration failures to 500', () => {
    for (const code of [
      'runtime-v2-schema-too-new',
      'runtime-v2-tmux-config-source-failed',
    ]) {
      const r = res();
      sendRuntimeApiError(r as never, Object.assign(new Error(code), {
        code,
        retryable: false,
      }));
      expect(r.status).toHaveBeenCalledWith(500);
      expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ error: code }));
    }
  });
});
```

- [ ] **Step 3: Add health endpoint**

Create `src/pages/api/v2/runtime/health.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const health = await supervisor.health();
    return res.status(200).json(health);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
```

- [ ] **Step 4: Add workspace endpoint**

Create `src/pages/api/v2/workspaces/index.ts`:

```ts
import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const createWorkspaceBodySchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultCwd: z.string().trim().min(1).optional(),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (req.method === 'GET') {
      const supervisor = getRuntimeSupervisor();
      await supervisor.ensureStarted();
      const workspaces = await supervisor.listWorkspaces();
      return res.status(200).json({ workspaces });
    }

    const body = parseRuntimeApiBody(createWorkspaceBodySchema, req.body ?? {});
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const workspace = await supervisor.createWorkspace({
      name: body.name ?? 'Runtime Workspace',
      defaultCwd: body.defaultCwd ?? os.homedir(),
    });
    return res.status(200).json(workspace);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
```

- [ ] **Step 5: Add workspace cleanup endpoint**

Create `src/pages/api/v2/workspaces/[workspaceId]/index.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const querySchema = z.object({
  workspaceId: z.string().min(1),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workspaceId } = parseRuntimeApiBody(querySchema, req.query);
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const result = await supervisor.deleteWorkspace(workspaceId);
    return res.status(200).json(result);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
```

- [ ] **Step 6: Add layout endpoint**

Create `src/pages/api/v2/workspaces/[workspaceId]/layout.ts`:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const querySchema = z.object({
  workspaceId: z.string().min(1),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { workspaceId } = parseRuntimeApiBody(querySchema, req.query);
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const layout = await supervisor.getLayout(workspaceId);
    if (!layout) return res.status(404).json({ error: 'runtime-v2-layout-not-found' });
    return res.status(200).json(layout);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
```

- [ ] **Step 7: Add tab create endpoint**

Create `src/pages/api/v2/tabs/index.ts`:

```ts
import os from 'os';
import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { parseRuntimeApiBody, sendRuntimeApiError, sendRuntimeDisabled } from '@/lib/runtime/api-handler';
import { verifyRuntimeV2ApiAuth } from '@/lib/runtime/api-auth';
import { getRuntimeSupervisor } from '@/lib/runtime/supervisor';

const createTabBodySchema = z.object({
  workspaceId: z.string().min(1),
  paneId: z.string().min(1),
  cwd: z.string().trim().min(1).optional(),
});

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (process.env.CODEXMUX_RUNTIME_V2 !== '1') {
    return sendRuntimeDisabled(res);
  }

  if (!(await verifyRuntimeV2ApiAuth(req))) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = parseRuntimeApiBody(createTabBodySchema, req.body ?? {});
    const supervisor = getRuntimeSupervisor();
    await supervisor.ensureStarted();
    const tab = await supervisor.createTerminalTab({
      workspaceId: body.workspaceId,
      paneId: body.paneId,
      cwd: body.cwd ?? os.homedir(),
    });
    return res.status(200).json(tab);
  } catch (err) {
    return sendRuntimeApiError(res, err);
  }
};

export default handler;
```

- [ ] **Step 8: Add runtime v2 API route tests**

Create `tests/unit/pages/runtime-v2-api.test.ts` using the existing
`tests/unit/pages/*.test.ts` request/response mock style:

```ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const supervisor = {
    ensureStarted: vi.fn(),
    health: vi.fn(),
    listWorkspaces: vi.fn(),
    createWorkspace: vi.fn(),
    deleteWorkspace: vi.fn(),
    createTerminalTab: vi.fn(),
    getLayout: vi.fn(),
  };
  return {
    auth: vi.fn(),
    getRuntimeSupervisor: vi.fn(() => supervisor),
    supervisor,
  };
});

vi.mock('@/lib/runtime/api-auth', () => ({
  verifyRuntimeV2ApiAuth: mocks.auth,
}));

vi.mock('@/lib/runtime/supervisor', () => ({
  getRuntimeSupervisor: mocks.getRuntimeSupervisor,
}));

import healthHandler from '@/pages/api/v2/runtime/health';
import workspacesHandler from '@/pages/api/v2/workspaces';
import workspaceCleanupHandler from '@/pages/api/v2/workspaces/[workspaceId]';
import layoutHandler from '@/pages/api/v2/workspaces/[workspaceId]/layout';
import tabsHandler from '@/pages/api/v2/tabs';

const createResponse = () => {
  let statusCode = 0;
  let body: unknown;
  const headers: Record<string, number | string | string[]> = {};
  const res = {
    setHeader: vi.fn((name: string, value: number | string | string[]) => {
      headers[name] = value;
      return res;
    }),
    status: vi.fn((code: number) => {
      statusCode = code;
      return res;
    }),
    json: vi.fn((value: unknown) => {
      body = value;
      return res;
    }),
  } as unknown as NextApiResponse;

  return {
    res,
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    headers,
  };
};

const createRequest = (input: {
  method?: string;
  body?: unknown;
  query?: Record<string, string>;
  url?: string;
}): NextApiRequest => ({
  method: input.method ?? 'GET',
  body: input.body,
  query: input.query ?? {},
  url: input.url ?? '/api/v2/runtime/health',
  headers: {},
}) as unknown as NextApiRequest;

describe('runtime v2 api routes', () => {
  beforeEach(() => {
    process.env.CODEXMUX_RUNTIME_V2 = '1';
    mocks.auth.mockReset();
    mocks.getRuntimeSupervisor.mockClear();
    Object.values(mocks.supervisor).forEach((mock) => mock.mockReset());
    mocks.auth.mockResolvedValue(true);
    mocks.supervisor.ensureStarted.mockResolvedValue(undefined);
    mocks.supervisor.health.mockResolvedValue({ ok: true, storage: {}, terminal: {} });
    mocks.supervisor.listWorkspaces.mockResolvedValue([{ id: 'ws-a', name: 'Runtime', defaultCwd: '/tmp', active: 1, orderIndex: 0, createdAt: 'now', updatedAt: 'now' }]);
    mocks.supervisor.createWorkspace.mockResolvedValue({ id: 'ws-a', rootPaneId: 'pane-a' });
    mocks.supervisor.deleteWorkspace.mockResolvedValue({ deleted: true, killedSessions: ['rtv2-ws-a-pane-a-tab-a'], failedKills: [] });
    mocks.supervisor.getLayout.mockResolvedValue({ root: { type: 'pane', id: 'pane-a', tabs: [] }, activePaneId: 'pane-a', updatedAt: 'now' });
    mocks.supervisor.createTerminalTab.mockResolvedValue({ id: 'tab-a', sessionName: 'rtv2-ws-a-pane-a-tab-a', name: '', order: 0, cwd: '/tmp', panelType: 'terminal', lifecycleState: 'ready' });
  });

  it('rejects unauthenticated v2 API calls', async () => {
    mocks.auth.mockResolvedValue(false);
    const response = createResponse();
    await healthHandler(createRequest({ method: 'GET' }), response.res);
    expect(response.statusCode).toBe(401);
  });

  it('rejects credential query parameters through the shared auth helper', async () => {
    const forbidden = new Set(['token', 'x-cmux-token', 'authorization', 'auth', 'api_key', 'apikey', 'access_token', 'session-token']);
    mocks.auth.mockImplementation(async (req: NextApiRequest) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      return !Array.from(url.searchParams.keys()).some((key) => forbidden.has(key.toLowerCase()));
    });
    for (const url of [
      '/api/v2/runtime/health?token=valid-cli-token',
      '/api/v2/runtime/health?x-cmux-token=valid-cli-token',
      '/api/v2/runtime/health?Authorization=Bearer%20abc',
    ]) {
      const response = createResponse();
      await healthHandler(createRequest({ method: 'GET', url }), response.res);
      expect(response.statusCode).toBe(401);
    }
  });

  it('returns disabled before auth when runtime v2 flag is off', async () => {
    process.env.CODEXMUX_RUNTIME_V2 = '0';
    mocks.auth.mockResolvedValue(false);
    const cases = [
      { handler: healthHandler, request: createRequest({ method: 'GET' }) },
      { handler: workspacesHandler, request: createRequest({ method: 'GET' }) },
      { handler: workspaceCleanupHandler, request: createRequest({ method: 'DELETE', query: { workspaceId: 'ws-a' } }) },
      { handler: layoutHandler, request: createRequest({ method: 'GET', query: { workspaceId: 'ws-a' } }) },
      { handler: tabsHandler, request: createRequest({ method: 'POST', body: { workspaceId: 'ws-a', paneId: 'pane-a' } }) },
    ];

    for (const { handler, request } of cases) {
      const response = createResponse();
      await handler(request, response.res);
      expect(response.statusCode).toBe(404);
      expect(response.body).toMatchObject({ error: 'runtime-v2-disabled' });
    }

    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.getRuntimeSupervisor).not.toHaveBeenCalled();
  });

  it('returns health and workspace lists', async () => {
    const health = createResponse();
    await healthHandler(createRequest({ method: 'GET' }), health.res);
    expect(health.statusCode).toBe(200);
    expect(health.body).toMatchObject({ ok: true });
    expect(mocks.getRuntimeSupervisor).toHaveReturnedWith(mocks.supervisor);
    expect(mocks.supervisor.ensureStarted).toHaveBeenCalled();

    const workspaces = createResponse();
    await workspacesHandler(createRequest({ method: 'GET' }), workspaces.res);
    expect(workspaces.statusCode).toBe(200);
    expect(workspaces.body).toMatchObject({ workspaces: [expect.objectContaining({ id: 'ws-a' })] });
  });

  it('validates tab creation requests', async () => {
    const response = createResponse();
    await tabsHandler(createRequest({ method: 'POST', body: { workspaceId: '', paneId: '' } }), response.res);
    expect(response.statusCode).toBe(400);
    expect(response.body).toMatchObject({ error: 'invalid-runtime-v2-request' });
  });

  it('creates terminal tabs and returns a session name', async () => {
    const response = createResponse();
    await tabsHandler(createRequest({
      method: 'POST',
      body: { workspaceId: 'ws-a', paneId: 'pane-a', cwd: '/tmp' },
    }), response.res);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ sessionName: 'rtv2-ws-a-pane-a-tab-a' });
  });

  it('deletes workspaces through the cleanup endpoint', async () => {
    const response = createResponse();
    await workspaceCleanupHandler(createRequest({
      method: 'DELETE',
      query: { workspaceId: 'ws-a' },
    }), response.res);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatchObject({ deleted: true, killedSessions: ['rtv2-ws-a-pane-a-tab-a'], failedKills: [] });
    expect(mocks.supervisor.ensureStarted).toHaveBeenCalled();
    expect(mocks.supervisor.deleteWorkspace).toHaveBeenCalledWith('ws-a');
  });

  it('maps retryable worker failures to 503', async () => {
    mocks.supervisor.createTerminalTab.mockRejectedValue(Object.assign(new Error('terminal worker exited'), {
      code: 'worker-exited',
      retryable: true,
    }));
    const response = createResponse();
    await tabsHandler(createRequest({
      method: 'POST',
      body: { workspaceId: 'ws-a', paneId: 'pane-a' },
    }), response.res);
    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ retryable: true });
  });

  it('maps ensureStarted worker failures to retryable 503', async () => {
    mocks.supervisor.ensureStarted.mockRejectedValue(Object.assign(new Error('terminal worker exited'), {
      code: 'worker-exited',
      retryable: true,
    }));
    const response = createResponse();
    await tabsHandler(createRequest({
      method: 'POST',
      body: { workspaceId: 'ws-a', paneId: 'pane-a' },
    }), response.res);
    expect(response.statusCode).toBe(503);
    expect(response.body).toMatchObject({ error: 'worker-exited', retryable: true });
  });

  it('maps non-retryable domain errors from worker replies', async () => {
    mocks.supervisor.createTerminalTab.mockRejectedValue(Object.assign(new Error('pane does not belong to workspace'), {
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    }));
    const response = createResponse();
    await tabsHandler(createRequest({
      method: 'POST',
      body: { workspaceId: 'ws-a', paneId: 'pane-other' },
    }), response.res);
    expect(response.statusCode).toBe(409);
    expect(response.body).toMatchObject({
      error: 'runtime-v2-pane-workspace-mismatch',
      message: 'pane does not belong to workspace',
    });
    expect(response.body).not.toMatchObject({ retryable: true });
  });

  it('returns 404 for missing layouts', async () => {
    mocks.supervisor.getLayout.mockResolvedValue(null);
    const response = createResponse();
    await layoutHandler(createRequest({ method: 'GET', query: { workspaceId: 'ws-missing' } }), response.res);
    expect(response.statusCode).toBe(404);
  });
});
```

- [ ] **Step 9: Run runtime v2 API route tests**

Run:

```bash
corepack pnpm vitest run tests/unit/pages/runtime-v2-api.test.ts
```

Expected: PASS.

- [ ] **Step 10: Run TypeScript**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 11: Run runtime v2 API helper tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/api-auth.test.ts tests/unit/lib/runtime/api-handler.test.ts
```

Expected: PASS.

- [ ] **Step 12: Record checkpoint**

Record changed files and the runtime API test result. Do not commit unless the
user explicitly asks.

## Task 10: Experimental Runtime UI

**Files:**
- Create: `src/pages/experimental/runtime.tsx`
- Modify: `src/lib/message-namespaces.ts`
- Create: `messages/ko/runtime.json`
- Create: `messages/en/runtime.json`

- [ ] **Step 1: Add runtime message namespace and copy**

Modify `src/lib/message-namespaces.ts` by appending `runtime`:

```ts
export const MESSAGE_NAMESPACES = [
  'common', 'sidebar', 'header', 'terminal', 'connection',
  'workspace', 'login', 'onboarding', 'settings', 'stats',
  'reset', 'reports', 'timeline',
  'notification', 'session', 'messageHistory', 'webBrowser',
  'mobile', 'toolsRequired', 'diff', 'shortcuts', 'runtime',
] as const;
```

Create `messages/ko/runtime.json`:

```json
{
  "title": "Runtime V2",
  "description": "실험용 Supervisor + Worker 진단 화면",
  "refresh": "새로고침",
  "createWorkspace": "워크스페이스 생성",
  "createTerminalTab": "터미널 탭 생성",
  "attach": "터미널 연결",
  "retry": "재시도",
  "apiStatus": "API 상태",
  "defaultWorkspaceName": "Runtime V2 워크스페이스",
  "statusIdle": "대기 중",
  "creatingWorkspace": "워크스페이스 생성 중",
  "workspaceCreated": "워크스페이스 생성됨",
  "creatingTab": "터미널 탭 생성 중",
  "tabCreated": "터미널 탭 생성됨",
  "runtimeUnavailable": "Runtime v2가 비활성화되어 있습니다",
  "noWorkspaces": "v2 워크스페이스가 아직 없습니다",
  "selectWorkspaceFirst": "먼저 워크스페이스를 선택하거나 생성하세요",
  "terminalConnecting": "터미널 연결 중",
  "terminalConnected": "터미널 연결됨",
  "terminalClosed": "터미널 연결 종료됨",
  "terminalOutputEmpty": "출력 대기 중",
  "diagnosticDetails": "진단 JSON"
}
```

Create `messages/en/runtime.json`:

```json
{
  "title": "Runtime V2",
  "description": "Experimental Supervisor + Worker diagnostic surface",
  "refresh": "Refresh",
  "createWorkspace": "Create workspace",
  "createTerminalTab": "Create terminal tab",
  "attach": "Attach terminal",
  "retry": "Retry",
  "apiStatus": "API status",
  "defaultWorkspaceName": "Runtime V2 Workspace",
  "statusIdle": "Idle",
  "creatingWorkspace": "Creating workspace",
  "workspaceCreated": "Workspace created",
  "creatingTab": "Creating terminal tab",
  "tabCreated": "Terminal tab created",
  "runtimeUnavailable": "Runtime v2 is disabled",
  "noWorkspaces": "No v2 workspaces yet",
  "selectWorkspaceFirst": "Select or create a workspace first",
  "terminalConnecting": "Connecting terminal",
  "terminalConnected": "Terminal connected",
  "terminalClosed": "Terminal closed",
  "terminalOutputEmpty": "Waiting for output",
  "diagnosticDetails": "Diagnostic JSON"
}
```

- [ ] **Step 2: Add authenticated experimental page**

Create `src/pages/experimental/runtime.tsx`:

```tsx
import Head from 'next/head';
import type { GetServerSideProps } from 'next';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { PlugZap, Plus, RefreshCw, Terminal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { requireAuth } from '@/lib/require-auth';
import { loadMessagesServerBundle } from '@/lib/load-messages';
import { getPageShellLayout } from '@/components/layout/page-shell';

interface IRuntimeWorkspace {
  id: string;
  rootPaneId: string;
}

type TRuntimeApiStatus = 'statusIdle' | 'creatingWorkspace' | 'workspaceCreated' | 'creatingTab' | 'tabCreated';

const RuntimeExperimentalPage = () => {
  const t = useTranslations('runtime');
  const [workspace, setWorkspace] = useState<IRuntimeWorkspace | null>(null);
  const [layout, setLayout] = useState<unknown>(null);
  const [status, setStatus] = useState<TRuntimeApiStatus>('statusIdle');

  const createWorkspace = async () => {
    setStatus('creatingWorkspace');
    const res = await fetch('/api/v2/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: t('defaultWorkspaceName') }),
    });
    const data = await res.json() as IRuntimeWorkspace;
    setWorkspace(data);
    setStatus('workspaceCreated');
  };

  const createTab = async () => {
    if (!workspace) return;
    setStatus('creatingTab');
    await fetch('/api/v2/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: workspace.id, paneId: workspace.rootPaneId }),
    });
    const layoutRes = await fetch(`/api/v2/workspaces/${workspace.id}/layout`);
    setLayout(await layoutRes.json());
    setStatus('tabCreated');
  };

  return (
    <>
      <Head>
        <title>{t('title')}</title>
      </Head>
      <main className="mx-auto flex max-w-4xl flex-col gap-4 p-6">
        <header>
          <h1 className="text-xl font-semibold">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('description')}</p>
        </header>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button">
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {t('refresh')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={createWorkspace}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('createWorkspace')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" onClick={createTab} disabled={!workspace}>
            <Terminal className="mr-1.5 h-4 w-4" />
            {t('createTerminalTab')}
          </Button>
          <Button className="min-h-11 sm:min-h-9" variant="outline" type="button" disabled={!workspace}>
            <PlugZap className="mr-1.5 h-4 w-4" />
            {t('attach')}
          </Button>
        </div>
        <section className="rounded border p-3 text-sm">
          <div>{t('apiStatus')}: {t(status)}</div>
          <pre className="mt-3 overflow-auto text-xs">{JSON.stringify({ workspace, layout }, null, 2)}</pre>
        </section>
      </main>
    </>
  );
};

RuntimeExperimentalPage.getLayout = getPageShellLayout;

export const getServerSideProps: GetServerSideProps = async (context) => {
  const { locale, messages } = await loadMessagesServerBundle();
  return requireAuth(context, async () => ({ props: { messages, messagesLocale: locale } }), { skipPreflight: true });
};

export default RuntimeExperimentalPage;
```

Complete the page implementation with reload and terminal byte behavior:

- On mount, call `GET /api/v2/workspaces` and show existing v2 workspaces.
- After creating a tab, open a relative
  `/api/v2/terminal?session=${sessionName}&cols=80&rows=24` WebSocket URL so
  the browser sends the existing session cookie. Do not add token query
  parameters and do not try to set WebSocket headers from browser code.
- Send `pwd\n` through the v2 WebSocket using the existing binary terminal protocol and append received stdout to a small `<pre>`.
- Show attach/open/error/closed status separately from API create status.
- Add `'runtime'` to `MESSAGE_NAMESPACES` in `src/lib/message-namespaces.ts`.
- Put all visible labels, status text, button text, and errors in
  `messages/ko/runtime.json` and `messages/en/runtime.json`. Do not hardcode
  English-only copy in the page.
- Load messages in `getServerSideProps` using the existing SSR locale hydration
  pattern, the same way other authenticated pages do.
- Keep copy dense and operational; do not add a marketing-style hero.

- [ ] **Step 3: Run TypeScript**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Record checkpoint**

Record changed files and the UI typecheck result. Do not commit unless the user
explicitly asks.

## Task 11: Runtime Smoke Script And Documentation

**Files:**
- Create: `scripts/smoke-runtime-v2.mjs`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/ADR.md`
- Modify: `docs/TMUX.md`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Add automated runtime v2 smoke script**

Create `scripts/smoke-runtime-v2.mjs`:

```js
#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { WebSocket } from 'ws';

const baseUrl = process.env.CODEXMUX_RUNTIME_V2_SMOKE_URL || 'http://127.0.0.1:8132';
const token = process.env.CODEXMUX_TOKEN || process.env.CMUX_TOKEN || await fs.readFile(path.join(os.homedir(), '.codexmux', 'cli-token'), 'utf-8').then((s) => s.trim());
const headers = { 'x-cmux-token': token };
const MSG_STDIN = 0x00;
const MSG_STDOUT = 0x01;
const MSG_RESIZE = 0x02;
const encoder = new TextEncoder();

const encodeStdin = (data) => {
  const payload = encoder.encode(data);
  const frame = new Uint8Array(1 + payload.length);
  frame[0] = MSG_STDIN;
  frame.set(payload, 1);
  return frame;
};

const encodeResize = (cols, rows) => {
  const frame = new ArrayBuffer(5);
  const view = new DataView(frame);
  view.setUint8(0, MSG_RESIZE);
  view.setUint16(1, cols);
  view.setUint16(3, rows);
  return frame;
};

const request = async (pathname, init = {}) => {
  const res = await fetch(new URL(pathname, baseUrl), {
    ...init,
    headers: {
      ...headers,
      ...(init.headers || {}),
    },
  });
  if (!res.ok) throw new Error(`${init.method || 'GET'} ${pathname} failed: ${res.status} ${await res.text()}`);
  return res.json();
};

const wsUrl = (sessionName) => {
  const url = new URL(`/api/v2/terminal?session=${encodeURIComponent(sessionName)}&cols=80&rows=24`, baseUrl);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url;
};

const waitForOutput = (sessionName, expectedCwd) =>
  new Promise((resolve, reject) => {
    let output = '';
    const ws = new WebSocket(wsUrl(sessionName), { headers });
    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`timed out waiting for terminal output; got ${JSON.stringify(output.slice(-200))}`));
    }, 10_000);

    ws.on('open', () => {
      ws.send(encodeResize(100, 30));
      ws.send(encodeStdin('pwd\n'));
    });
    ws.on('message', (data) => {
      const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
      if (bytes[0] === MSG_STDOUT) {
        output += bytes.subarray(1).toString('utf-8');
      } else {
        output += bytes.toString('utf-8');
      }
      if (output.includes(expectedCwd)) {
        clearTimeout(timer);
        ws.close();
        resolve(output);
      }
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });

const main = async () => {
  let workspace;
  let failed = false;
  try {
    await request('/api/v2/runtime/health');
    workspace = await request('/api/v2/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Runtime V2 Smoke', defaultCwd: process.cwd() }),
    });
    const listed = await request('/api/v2/workspaces');
    if (!listed.workspaces?.some((w) => w.id === workspace.id)) {
      throw new Error(`created workspace not returned by list: ${workspace.id}`);
    }
    const tab = await request('/api/v2/tabs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspaceId: workspace.id, paneId: workspace.rootPaneId, cwd: process.cwd() }),
    });
    await waitForOutput(tab.sessionName, process.cwd());
    console.log(JSON.stringify({ ok: true, workspaceId: workspace.id, tabId: tab.id, sessionName: tab.sessionName }, null, 2));
  } catch (err) {
    failed = true;
    throw err;
  } finally {
    if (workspace?.id) {
      try {
        await request(`/api/v2/workspaces/${encodeURIComponent(workspace.id)}`, { method: 'DELETE' });
      } catch (err) {
        if (!failed) throw err;
        console.error(`cleanup failed for workspace ${workspace.id}: ${err instanceof Error ? err.message : err}`);
      }
    }
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});
```

The script assumes the server is already running with `CODEXMUX_RUNTIME_V2=1`.
It must authenticate with the `x-cmux-token` header, not a login cookie or query
parameter. This is allowed because the script runs in Node and uses the `ws`
client's header support. It must use the same binary terminal protocol as the
production terminal path for stdin/stdout/resize while still routing through
`/api/v2/terminal`. It must not send `MSG_KILL_SESSION`; first-slice cleanup is
the authenticated workspace delete API. It must call authenticated
`DELETE /api/v2/workspaces/:workspaceId` in `finally` so durable smoke rows do
not accumulate.

- [ ] **Step 2: Update `docs/ARCHITECTURE-LOGIC.md`**

Add a section near "핵심 구조":

```md
## Experimental Runtime v2

`CODEXMUX_RUNTIME_V2=1` starts an experimental Supervisor + worker runtime in
parallel with the current runtime. Supervisor owns public routing and worker
  lifecycle. Storage Worker owns `~/.codexmux/runtime-v2/state.db`. Terminal Worker owns
  tmux lifecycle commands in the separate `codexmux-runtime-v2` socket with
  `rtv2-` session names, plus the `/api/v2/terminal`
  attach/stdin/stdout/resize path for experimental runtime v2 smoke.

The current production terminal/timeline/status paths remain the default until
the runtime v2 branch passes process-level and platform smoke tests.
```

- [ ] **Step 3: Update `docs/DATA-DIR.md`**

Add `runtime-v2/state.db` to the structure and major file table:

```md
├── runtime-v2/
│   └── state.db
```

```md
| `runtime-v2/state.db` | Experimental runtime v2 SQLite app state for workspace, pane, tab, status projection, and durable event logs |
```

Also document `CODEXMUX_RUNTIME_V2_RESET=1` and the timestamped backup naming
for existing `runtime-v2/state.db`, `runtime-v2/state.db-wal`, and
`runtime-v2/state.db-shm` files.

- [ ] **Step 4: Update `docs/ADR.md` with proposed ADRs**

Add a proposed section:

```md
## Proposed: Supervisor And Worker Runtime

- Status: Proposed
- Decision: Keep Pages Router and the custom server, but introduce a Supervisor
  role that starts worker processes and routes typed IPC commands. The
  Supervisor singleton, in-flight start promise, and prepared runtime DB path
  live on `globalThis` so the custom server and Next API routes share one
  runtime.
- Rationale: terminal IO, storage mutation, JSONL parsing, and process polling
  should have explicit failure and ownership boundaries.
- Consequences: runtime v2 API routes call worker-backed Supervisor services
  instead of direct store or tmux helpers. API routes retrieve the singleton and
  await `ensureStarted()`; they do not construct worker clients.
```

Also add proposed entries for SQLite app state, typed IPC, and ephemeral terminal
streams using the wording from the approved design spec. The typed IPC ADR must
mention the first-slice command registry and successful reply payload validation,
not only envelope validation. The SQLite app state ADR must mention that
`better-sqlite3` is optional and lazily loaded so runtime v2 off installs/builds
do not depend on the native binding.

- [ ] **Step 5: Update `docs/TMUX.md`**

Add an experimental runtime v2 section that explains:

- existing `/api/terminal` remains the production terminal WebSocket
- `/api/v2/terminal` is the experimental Terminal Worker-owned path
- v2 attach/stdin/stdout/resize flows through Supervisor IPC and Terminal Worker `node-pty`
- v2 terminal stdout is realtime-only and not persisted
- first-slice stdout coalescing/backpressure caps protect Worker-to-Supervisor
  IPC from unbounded output
- production reconnect/lifecycle parity remains a follow-up hardening plan

- [ ] **Step 6: Update `docs/STATUS.md`**

Add an experimental runtime v2 note that explains:

- `tab_status` exists in SQLite as schema foundation only
- production status source of truth remains `StatusManager` plus layout metadata
- Status Worker migration, status event persistence, and notification/session-history policy are follow-up work

- [ ] **Step 7: Run docs sanity checks**

Run:

```bash
rg -n "CODEXMUX_RUNTIME_V2|CODEXMUX_RUNTIME_V2_RESET|runtime-v2/state.db|Supervisor And Worker Runtime|/api/v2/terminal|tab_status" docs/ARCHITECTURE-LOGIC.md docs/DATA-DIR.md docs/ADR.md docs/TMUX.md docs/STATUS.md
```

Expected: all five files contain the relevant runtime references.

- [ ] **Step 8: Record checkpoint**

Record changed files and the documentation grep result. Do not commit unless the
user explicitly asks.

## Task 12: Full Verification Gate

**Files:**
- No source edits unless verification finds issues.

- [ ] **Step 1: Run runtime unit tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/worker-command-validation.test.ts tests/unit/lib/runtime/worker-paths.test.ts tests/unit/lib/runtime/worker-client.test.ts tests/unit/lib/runtime/storage-repository.test.ts tests/unit/lib/runtime/storage-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/terminal-ws.test.ts tests/unit/lib/runtime/server-ws-upgrade.test.ts tests/unit/lib/runtime/api-auth.test.ts tests/unit/lib/runtime/api-handler.test.ts tests/unit/pages/runtime-v2-api.test.ts
```

Expected: PASS.

- [ ] **Step 1a: Run real Terminal Worker process integration test**

Run on Linux:

```bash
corepack pnpm vitest run tests/integration/runtime-v2-terminal-process.test.ts
```

Expected: PASS. This is the smallest process-level gate for the terminal byte
path: real tmux session creation, real `node-pty` attach, stdin, stdout, resize,
and kill in the isolated `codexmux-runtime-v2` socket. On Linux, missing `tmux`
or an unresolved `node-pty` native binding is a verification failure, and Linux
CI must install `tmux` instead of skipping this test. Non-Linux CI may skip this
one integration test, but Electron/Android platform smoke still must run through
their separate gates.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run lint**

Run:

```bash
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Run production build**

Run:

```bash
corepack pnpm build
```

Expected: PASS, `dist/workers/storage-worker.js` and
`dist/workers/terminal-worker.js` exist, and build output keeps
`better-sqlite3` as a lazy optional runtime load without bundling the native
binary into the worker file. `.next/standalone/src/config/tmux.conf` exists.
Runtime v2 off build must not require loading the SQLite binding.

- [ ] **Step 4a: Run Electron native packaging verification**

Run:

```bash
corepack pnpm build:electron
CODEXMUX_RUNTIME_V2=1 corepack pnpm run verify:runtime-native -- --electron
```

Expected: PASS. The verification confirms:

- `.next/standalone/node_modules/node-pty` resolves from the standalone module
  tree
- `node-pty` has a native binding or installed platform prebuild available to
  the standalone runtime
- `.next/standalone/node_modules/better-sqlite3` exists when runtime v2 is on
- `better-sqlite3` has a native `.node` binding available to the standalone
  runtime
- worker output exists under `dist/workers/*.js`
- tmux config exists at `.next/standalone/src/config/tmux.conf` and resolves to
  `app.asar.unpacked/src/config/tmux.conf` for packaged Electron
- packaged Electron runtime assumptions point workers and native packages at
  `app.asar.unpacked`, not inside `app.asar`

If the optional SQLite package is absent with runtime v2 off, the script may
skip the SQLite check. With `CODEXMUX_RUNTIME_V2=1`, missing or unresolved
`better-sqlite3` is a hard failure with `runtime-v2-sqlite-unavailable`.
Failures that indicate Electron ABI rebuild or unpack problems must be fixed
before runtime v2 is marked verified for Electron local mode.

- [ ] **Step 5: Start experimental runtime with an isolated DB**

Run:

```bash
CODEXMUX_RUNTIME_V2=1 CODEXMUX_RUNTIME_DB=/tmp/codexmux-runtime-v2-smoke/state.db PORT=8132 corepack pnpm dev
```

- [ ] **Step 6: Run automated runtime v2 smoke**

In another terminal, after the server starts, run:

```bash
CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8132 node scripts/smoke-runtime-v2.mjs
```

Expected: PASS with JSON including `"ok": true`, a workspace id, a tab id, and a `rtv2-ws-...` session name. The script must prove `/api/v2/terminal` attach and stdout by sending `pwd\n` and observing the expected cwd.

- [ ] **Step 7: Manual browser smoke for experimental runtime**

Open `/experimental/runtime` in an authenticated browser session and run the
same smoke path on desktop and a mobile viewport. Confirm:

- the runtime-disabled state shows the localized disabled copy when
  `CODEXMUX_RUNTIME_V2` is not `1`
- no browser console errors appear during the enabled smoke path
- the page shows v2 runtime health before destructive or create actions
- `Create workspace` updates the workspace list and diagnostic JSON
- `Create terminal tab` returns a tab with a `rtv2-ws-...` session name
- `Attach` opens the v2 terminal WebSocket, not `/api/terminal`
- sending `pwd` through the page shows stdout from the worker-owned terminal
  attach path
- browser reload can list existing v2 workspaces through `GET /api/v2/workspaces`
- mobile layout keeps buttons tappable and terminal output scrollable without
  covering controls

Any failure in this browser smoke is a verification failure. Fix it before
marking Task 12 complete and use the Step 9 verification-fix commit only if the
fix changes files.

- [ ] **Step 8: Verify reset behavior**

Run once with an existing smoke DB:

```bash
CODEXMUX_RUNTIME_V2=1 CODEXMUX_RUNTIME_V2_RESET=1 CODEXMUX_RUNTIME_DB=/tmp/codexmux-runtime-v2-smoke/state.db PORT=8133 corepack pnpm dev
```

Expected: existing `/tmp/codexmux-runtime-v2-smoke/state.db` is moved to a
timestamped `.bak` file, existing
`/tmp/codexmux-runtime-v2-smoke/state.db-wal` and
`/tmp/codexmux-runtime-v2-smoke/state.db-shm` sidecar files are moved to
matching timestamped `.bak` files when present, and a fresh DB is created.
Repeat the reset check with sidecar-only setup where `state.db-wal` and/or
`state.db-shm` exist but `state.db` does not; those sidecars must still move to
timestamped `.bak` files and no stale sidecar may remain at the original path.
`CODEXMUX_RUNTIME_V2=1` without `CODEXMUX_RUNTIME_V2_RESET=1` must reuse the DB.

- [ ] **Step 9: Record final verification checkpoint**

When verification required fixes, record the changed files and rerun commands
that now pass. When no files changed after verification, record that no
verification fixes were needed. Do not commit unless the user explicitly asks.

## Completion Criteria

The plan is complete when:

- runtime v2 IPC contract exists and command-specific payload/reply registry plus
  first-slice event registry are tested
- RuntimeWorkerClient preserves structured failed-reply `code`/`retryable`
  fields through Supervisor rejection and API error mapping, rejects reply
  envelope correlation mismatches with `invalid-worker-reply` before payload
  success/backoff updates, rejects malformed reply envelopes immediately when a
  pending `commandId` is recoverable from raw input, rejects success replies that
  carry `error` and failed replies without structured `error`/`payload: null`,
  validates reply constructors for discriminated shape and registered successful
  reply payloads, validates registered-event constructors before returning,
  validates runtime event source/target/delivery/payload before `onEvent`, drops
  invalid events without restart, removes timed-out requests from the pending
  map, and ignores late success/failed replies for timed-out command ids without
  resetting backoff/readiness state; `child.send` uses callback delivery, treats
  boolean false as backpressure only, and callback error/throw paths both clear
  timeout, remove pending state, and reject with retryable `worker-not-connected`,
  then escalate the captured child to the single failure path for best-effort
  kill/restart; late send callback failures after timeout do not restart the
  worker; worker `error` followed by `exit` is handled once for the current
  child, with one `onExit`, one pending rejection, best-effort child kill, and
  one scheduled restart; restart backoff resets only after successful reply
  payload validation, not malformed `ok: true` replies; shutdown is terminal for
  the worker-client instance, so later start is no-op and later
  request/readiness calls reject with non-retryable `worker-shutdown`; shutdown
  child kill is best-effort and does not throw or schedule restart; readiness
  transport/lifecycle failures best-effort kill/restart the captured child;
  pre-send disconnected children are best-effort killed/restarted, while missing
  children and normal worker failed replies do not start an extra restart
- Storage and Terminal Worker services use the shared worker command validation
  helper to reject commands with invalid source/target, unregistered command
  type, or wrong worker namespace as non-retryable `invalid-worker-command`
  before domain handlers run; malformed command envelopes without an id are
  dropped by worker entrypoints
- runtime v2 API errors use explicit HTTP status mapping for validation,
  missing resources, conflicts, retryable worker failures, and
  startup/configuration failures including missing worker scripts
- runtime v2 HTTP routes return `404 runtime-v2-disabled` before auth, method
  validation, request parsing, or Supervisor access when `CODEXMUX_RUNTIME_V2`
  is not `1`
- `/api/v2/terminal` WebSocket upgrades return `404 runtime-v2-disabled` before
  runtime/generic WebSocket auth, session parsing, or `handleUpgrade()` when
  `CODEXMUX_RUNTIME_V2` is not `1`, and disabled/unauthorized/invalid-session
  upgrade failures use one JSON error helper with stable headers;
  `createWebSocketUpgradeHandler()` wraps the shared `routeWebSocketUpgrade()`
  path so dev/prod fallback wiring is testable without importing `server.ts`;
  missing, empty, non-origin-form, raw non-ASCII/control/space/hash-containing,
  malformed percent-encoding, encoded path delimiters, or malformed WebSocket
  request URLs return `400 invalid-websocket-url` before auth, upgrade handling,
  or fallback proxying; runtime v2 namespace paths, including bare `/api/v2`, other than
  `/api/v2/terminal` return `404 runtime-v2-upgrade-not-found` before auth,
  upgrade handling, or fallback
  proxying; `routeWebSocketUpgrade()` parses upgrade URLs once and passes the
  parsed `URL`/v2 context to injected routing callbacks; runtime/generic auth
  verifier exceptions fail closed as `401 Unauthorized` via
  `writeUpgradeJsonError()`; upgrade JSON errors use `socket.end(response)` with
  `\r\n\r\n` before the JSON body and destroy fallback only when `end()` throws
- runtime v2 HTTP/WebSocket auth accepts session cookie and `x-cmux-token`
  header where appropriate, rejects query-string credentials, and keeps browser
  clients cookie-only
- runtime v2 session names are generated by Supervisor only, validate through a
  strict tmux-safe `rtv2-` schema, and reject unsafe or too-long names before
  tmux commands run
- Supervisor can resolve dev/web/Electron worker scripts, coalesce concurrent
  `ensureStarted()` calls through one `globalThis` singleton/startPromise,
  readiness-check, restart, and shut down Storage and Terminal workers
- runtime v2 reset backup moves `state.db`, `state.db-wal`, and `state.db-shm`
  independently when any one exists, including sidecar-only cases, and repeated
  `ensureStarted()` calls do not run backup twice
- Supervisor marks runtime started only after both worker readiness checks and
  startup reconciliation succeed, treats pending-intent Storage transition
  failures as startup failures, and cleanly shuts down partial workers before
  the next retry
- startup reconciliation skips tmux cleanup for invalid pending `sessionName`
  values, still durably marks those intents failed, and never sends unsafe names
  to Terminal Worker
- terminal tab create rollback attempts best-effort `terminal.kill-session`
  after any sent create command fails or finalize fails, does not hide
  `storage.fail-pending-terminal-tab` failures, and surfaces durable
  pending-intent transition failures to the caller
- Supervisor authorizes v2 terminal attach through Storage-backed ready terminal
  tabs, rejecting fabricated, pending, failed, or stale `rtv2-` names before
  Terminal Worker commands run; Terminal Worker rejects missing tmux sessions
  with non-retryable `runtime-v2-terminal-session-not-found` before `node-pty`
  spawn and the first slice does not mutate the ready tab to failed during
  attach; concurrent subscribers wait for the same in-flight attach result;
  in-flight attach failure removes every subscriber from that attempt, sends
  best-effort `terminal.detach` after any sent attach command, and preserves the
  original attach failure for all waiting callers; first-slice WebSocket kill is
  unsupported and cleanup kill remains Supervisor-internal only
- Supervisor authorizes v2 terminal stdin and resize through active
  `subscriberId`, rejecting missing or detached subscribers before Terminal
  Worker commands run; later subscriber attach dimensions do not auto-resize an
  already-attached shared pty, only explicit resize frames change pty size, and
  WebSocket close/error during pending attach detaches the returned subscriber
  exactly once if attach later succeeds; already-sent attach IPC commands are not
  canceled in this first slice, and all-waiting-subscriber close is cleaned by
  one final `terminal.detach` after attach success
- Storage Worker can create/list workspace state, enforce workspace/pane
  ownership for pending terminal tabs, record pending terminal-tab intents,
  assign stable per-pane tab order, finalize ready tabs as the active pane tab,
  and mark failed intents using Supervisor-supplied tab id/sessionName; missing,
  already-finalized, or already-failed pending-tab lifecycle transitions return
  `runtime-v2-pending-tab-not-found`; workspace delete returns the deleted
  workspace's terminal sessions from the delete transaction
- Storage schema includes the approved foundation tables and indexes, including
  migration, group, status event, agent session, and remote source tables, with
  v1 recorded through an idempotent migration runner and newer DB versions
  rejected as `runtime-v2-schema-too-new`
- Terminal Worker can create/kill tmux sessions in the isolated
  `codexmux-runtime-v2` socket and own v2 node-pty attach/stdin/stdout/resize
- `terminal.create-session`, `terminal.attach`, and `terminal.resize` IPC
  payload schemas enforce `cols 1..500` and `rows 1..200`; WebSocket attach and
  resize handlers clamp before IPC, while oversized direct/internal IPC callers
  fail validation before Terminal Worker
  through IPC with bounded, byte-accounted, Unicode-safe stdout
  coalescing/backpressure, with detach/kill/backpressure clearing buffered
  partial output instead of flushing it and late pty output ignored after
  detach/backpressure
- Terminal Worker service preserves structured runtime error `code`/`retryable`
  fields in failed IPC replies instead of collapsing them to `command-failed`
- Terminal Worker resolves tmux config through `resolveRuntimeTmuxConfigPath()`,
  preserves `runtime-v2-tmux-config-source-failed` when `tmux source-file`
  fails, best-effort kills the just-created session after post-create failure,
  and web/npm plus Electron standalone builds include `src/config/tmux.conf`
- real process-level Terminal Worker integration passes for tmux create, `node-pty`
  attach, stdin, stdout, resize, and kill on the isolated v2 tmux socket
- API v2 can list/create/delete v2 workspaces, create a terminal tab, and return a layout projection
- workspace delete commits Storage deletion before best-effort tmux cleanup,
  closes existing subscribers without `terminal.detach`, waits for any in-flight
  attach attempt for the deleted session to settle before `terminal.kill-session`,
  reports `failedKills`, skips cleanup for invalid listed `sessionName` values
  while recording them in `failedKills`, treats missing workspaces as idempotent
  `{ deleted: false }` without recording a delete event even if orphan tab rows
  exist, uses only the `sessions` returned by `storage.delete-workspace`, allows
  raw cleanup session strings through IPC validation, and never closes
  subscribers or kills tmux sessions when Storage delete fails or returns
  `deleted: false`
- `/api/v2/terminal` can attach to the created tab, accept stdin, emit stdout, resize, and detach without using old `/api/terminal`
- multiple `/api/v2/terminal` subscribers for one session share one Terminal
  Worker attach stream through Supervisor fanout, and Terminal Worker detach is
  sent only after the last subscriber leaves
- automated runtime v2 smoke script passes against a running `CODEXMUX_RUNTIME_V2=1` server
- experimental page can exercise the new API path and v2 terminal WebSocket path
- docs explain runtime v2 as experimental in architecture, data-dir, ADR, TMUX, and STATUS docs
- optional native SQLite lazy-load, error, build, and Electron/standalone
  native binding packaging behavior is covered
- TypeScript, lint, build, runtime unit tests, and v2 smoke pass

## Plan Self-Review

- Spec coverage: all approved first-slice decisions map to tasks. Runtime Worker
  readiness/restart/backoff is covered in Task 3, SQLite foundation schema in
  Task 4, Storage Worker APIs in Task 5, Terminal Worker attach/input/output in
  Tasks 6-8, authenticated v2 HTTP/WebSocket surface in Tasks 8-10, smoke
  automation in Task 11, and docs/ADR/STATUS/TMUX updates in Task 11.
- Scope boundary: this plan deliberately implements only the experimental first
  slice behind `CODEXMUX_RUNTIME_V2=1`. Production terminal reconnect/lifecycle parity,
  Timeline/Status Worker migration, full Electron/Android app smoke automation,
  and full storage command migration remain follow-up plans.
- Red-flag scan: checked the plan/spec for the blocked vague-plan terms listed
  by `superpowers:writing-plans`; no matches remain.
- Type consistency: Supervisor terminal methods, Worker Client callbacks,
  `/api/v2/terminal` protocol handling, and smoke script frame constants all use
  the same `sessionName`, `cols`, `rows`, `MSG_*`, `encodeStdout`,
  `decodeMessage`, `textDecoder`, and `x-cmux-token` names.
- Open decisions for this first slice: none.

## Execution Handoff

Plan complete and saved to
`docs/superpowers/plans/2026-05-02-runtime-architecture-redesign.md`.

Two execution options:

1. Subagent-Driven (recommended): use `superpowers:subagent-driven-development`
   and dispatch a fresh worker per task with review between tasks.
2. Inline Execution: use `superpowers:executing-plans` and execute tasks in this
   session with batch checkpoints.

## Follow-Up Plans

After this plan lands, write separate implementation plans for:

1. Terminal Worker production hardening for reconnect recovery, lifecycle reconciliation, advanced throttling, and parity with old `/api/terminal`.
2. Storage Worker full command coverage for config/auth/keybinding/session metadata, backup/export/reset tooling, and invariants.
3. Timeline Worker JSONL watcher/parser/session index migration.
4. Status Worker reducer, notification, session-history, and reconnect policy migration.
5. Full platform smoke automation for Electron, Android, and Windows companion.
