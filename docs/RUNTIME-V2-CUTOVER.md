# Runtime v2 Production Cutover Plan

이 문서는 Supervisor + Worker runtime v2를 production 기본 경로로 전환하기 위한 단계별 기준이다.

## Current State

완료된 foundation:

- Storage Worker: SQLite schema, workspace create/list/layout, terminal tab create/delete, workspace delete cleanup.
- Terminal Worker: v2 tmux socket `codexmux-runtime-v2`, `rtv2-` session create/attach/stdin/stdout/resize/detach/kill, subscriber fanout, backpressure, startup reconciliation.
- Timeline Worker: read-only `timeline.health`, session list, older entry read, message counts.
- Status Worker: policy-only hook/Codex reducer와 notification gating.
- Shadow diagnostics: server startup calls runtime v2 health without blocking legacy startup, and `/api/debug/perf` exposes worker health/readiness/restart/timeout counters.
- Terminal identity: newly created legacy tabs carry `runtimeVersion: 1`, runtime v2 tabs carry `runtimeVersion: 2`, and missing `runtimeVersion` is treated as legacy for existing JSON layouts.
- Smoke: `/api/v2/terminal` attach/input/output/resize/web stdin/heartbeat/fresh reattach/fanout/backpressure close/tab delete/tab restart/workspace delete, plus Phase 2 app-surface new-tab gate for browser reload, server restart, and terminal mode rollback.
- 2026-05-03 live smoke snapshot: `corepack pnpm smoke:runtime-v2:phase2`, `corepack pnpm build:electron`, `corepack pnpm smoke:electron:attach`, `corepack pnpm smoke:electron:runtime-v2`, `corepack pnpm smoke:android:runtime-v2`, Mac M1 `pnpm pack:electron:dev`, Android debug install, Android Tailscale failure recovery, Android production foreground reconnect, Android app info/native restart, Windows sync dry-run, stats/daily report, permission prompt smoke, and systemd deploy health passed. Electron page-context smoke proved existing-cookie `/api/v2/terminal` attach/output plus 2회 page reload/reconnect on a temp runtime v2 server. Android runtime v2 smoke proved existing-cookie `/api/v2/terminal` attach/output plus 2회 foreground reconnect on SM-S928N Android 16 through the Tailscale IP temp server. Android production foreground reconnect showed `triggerEvent`/TypeError 0 and terminal/timeline WebSocket console error 0 after foreground grace suppression. macOS packaging created arm64/x64 DMG and zip artifacts; GUI launch smoke still needs an interactive Mac user session.

Production 기본 경로로 전환하지 않은 것:

- 기존 `/api/terminal`, `/api/timeline`, `/api/status`, `/api/sync` WebSocket.
- 기존 JSON workspace/layout/config/keybinding/message-history stores.
- Timeline live file watch, resume flow, session-changed broadcast.
- Status polling, JSONL watch, Web Push, session history write, dismiss/ack handling.
- 기존 `pt-` tmux session의 `rtv2-` session migration.

## Cutover Rules

- Runtime v2 must stay behind explicit flags until the matching rollback path has passed smoke.
- Do not replace terminal, storage, timeline, and status in one release.
- New v2 defaults must first apply to newly created workspaces/tabs only. Existing `pt-` sessions remain legacy until migration is explicitly selected.
- Production data migration must be idempotent and must not delete JSON stores on first enable.
- Rollback must not require deleting `~/.codexmux/runtime-v2/state.db`.
- Worker readiness failure must fail closed to legacy where possible, not partially mix a v2 UI with missing workers.

## Feature Flags

Introduce separate flags instead of overloading `CODEXMUX_RUNTIME_V2`.

| Flag | Values | Purpose |
| --- | --- | --- |
| `CODEXMUX_RUNTIME_V2` | `0`, `1` | Starts Supervisor and workers. |
| `CODEXMUX_RUNTIME_STORAGE_V2_MODE` | `off`, `shadow`, `write`, `default` | Controls SQLite workspace/layout ownership. |
| `CODEXMUX_RUNTIME_TERMINAL_V2_MODE` | `off`, `opt-in`, `new-tabs`, `default` | Controls terminal tab creation/attach path. |
| `CODEXMUX_RUNTIME_TIMELINE_V2_MODE` | `off`, `shadow`, `default` | Controls timeline HTTP/WebSocket path. |
| `CODEXMUX_RUNTIME_STATUS_V2_MODE` | `off`, `shadow`, `default` | Controls status polling/WebSocket/notification path. |

`CODEXMUX_RUNTIME_V2=1` with every surface mode `off` should only start workers and expose v2 diagnostic endpoints.

## Phase 0: Parity Inventory

Before any default switch, create a checked parity matrix for every production surface:

- Workspace: create, rename, reorder, group, active workspace, validate cwd, layout split/move/order/delete/rename, message history.
- Terminal: attach, stdin, web stdin, resize, heartbeat, kill, backpressure, reconnect, mobile foreground reconnect, Electron/Android WebView cookie auth.
- Timeline: init, append, subscribe/unsubscribe, resume, session-changed, load-more, message counts, session list filters, Windows remote JSONL.
- Status: initial sync, update/remove, hook/statusline events, needs-input ack, dismiss, ready-for-review notification, Web Push, session history.
- Sync: workspace/layout/config invalidation for browser, Electron, Android, and CLI clients.

Exit gate:

- Each row has owner module, v1 behavior, v2 behavior, migration strategy, test command, rollback behavior.
- `docs/RUNTIME-V2-PARITY.md` is the canonical matrix and must be updated before changing any surface mode.

## Phase 1: Shadow Runtime

Goal: run all workers in production while legacy remains the only user-facing path.

Work:

- Start `CODEXMUX_RUNTIME_V2=1` in production service.
- Add `/api/debug/perf` counters for each worker readiness, restart, timeout, and command error.
- Add a startup diagnostic that calls `runtime.health` and records worker health without blocking legacy startup.
- Run runtime v2 smoke against an isolated DB in CI and against the production host before release.

Exit gate:

- No worker restart loop over 24 hours.
- `/api/debug/perf` `services.runtimeWorkers.{storage,terminal,timeline,status}` shows health, readiness, restart, timeout, and command failure counters without session ids, cwd, JSONL paths, prompts, assistant text, or terminal output.
- `corepack pnpm build` includes storage, terminal, timeline, and status worker bundles.
- `scripts/smoke-runtime-v2.mjs` passes on the production host with temp HOME/DB.

Rollback:

- Set `CODEXMUX_RUNTIME_V2=0`; legacy routes are unchanged.

## Phase 2: Terminal v2 For New Tabs

Goal: let selected users create new terminal tabs through v2 while legacy tabs stay on `pt-`.

Work:

- Add UI/server routing that chooses v2 only for newly created terminal tabs when `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=new-tabs`.
- Keep existing `pt-` sessions and legacy JSON layout as the UI source of truth.
- Make tab identity explicit in UI state: `runtimeVersion: 1 | 2`.
- Parse `CODEXMUX_RUNTIME_TERMINAL_V2_MODE` through `src/lib/runtime/terminal-mode.ts`; unknown values fail closed to `off`.
- Ensure close/delete uses the matching runtime cleanup path.
- Ensure restart uses the matching runtime path: runtime v2 tabs must be recreated
  through Supervisor/Storage/Terminal Worker with the same tab id and `rtv2-`
  session name, not through the legacy tmux socket.
- In the first new-tabs slice, route only plain terminal tab creation through v2. Codex, diff, web-browser, resume, and command-start tabs remain legacy.
- Mirror the legacy workspace/pane id into runtime v2 storage, then append the returned `rtv2-` tab back into legacy JSON layout with `runtimeVersion: 2`.
- Keep `scripts/smoke-runtime-v2.mjs` for low-level runtime terminal parity and `scripts/smoke-runtime-v2-phase2-gate.mjs` for app-surface new-tab routing, browser reload, server restart, and rollback mode checks.
- Collect Electron reconnect and Android foreground reconnect cookie-auth evidence against the same app surface before widening Phase 2. `corepack pnpm smoke:electron:runtime-v2` covers Electron page-context cookie-auth attach/output and page reload/reconnect repetition; `corepack pnpm smoke:android:runtime-v2` covers Android WebView cookie-auth attach/output and foreground reconnect repetition; packaged OS window foreground UX still needs interactive Mac evidence.

Exit gate:

- `node scripts/smoke-runtime-v2-phase2-gate.mjs` passes and proves new v2 tabs survive browser reload and server restart while legacy tabs stay on `/api/terminal`.
- Runtime v2 tab restart after `session-not-found` recreates the same tab/session
  through Supervisor and reconnect controls remain actionable; blocking recovery
  overlays must not leave a visible but unclickable floating reconnect control.
- Electron page-context reconnect and Android foreground reconnect smoke pass with existing session cookie auth on `/api/v2/terminal`.
- Android production legacy foreground reconnect passing is necessary but not sufficient for this exit gate; `corepack pnpm smoke:android:runtime-v2` is the Android `/api/v2/terminal` evidence for the current new-tabs slice.
- Legacy tabs continue to attach through `/api/terminal`.
- Rollback mode `off` blocks new v2 tab creation, `/api/v2/runtime/health` reports `terminalV2Mode: "off"`, and existing v2 tabs remain visible with a clear `runtime-v2-disabled` diagnostic state.

Rollback:

- Switch `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`.
- Keep `state.db` and v2 tmux sessions for explicit recovery; do not auto-delete.

## Phase 3: Storage v2 Shadow Then Default

Goal: move workspace/layout/tab source of truth to SQLite safely.

Work:

- Implement idempotent JSON-to-SQLite migration with dry-run output.
- Add shadow read comparison: legacy JSON projection vs SQLite projection.
- Add dual-write only where operations can preserve ordering and transaction semantics; otherwise keep v1 write and v2 shadow import.
- Add backup/export command for `state.db` and JSON stores.
- Add migration tests with malformed layout, missing cwd, deleted workspace, stale session names, grouped workspaces, and split panes.

Exit gate:

- Shadow compare passes on real `~/.codexmux` data.
- Default mode can cold-start entirely from SQLite.
- Legacy JSON fallback can still render the previous layout after disabling storage v2.

Rollback:

- Switch `CODEXMUX_RUNTIME_STORAGE_V2_MODE=off`.
- Legacy JSON remains source of truth until a later cleanup release.

## Phase 4: Timeline v2 WebSocket Cutover

Goal: move live timeline subscribe/append/resume into Timeline Worker.

Work:

- Move file watcher/session watcher state into Timeline Worker, not just read commands.
- Add typed events for `timeline:init`, `timeline:append`, `timeline:session-changed`, and `timeline:error`.
- Keep stable id/dedupe/merge behavior unchanged.
- Preserve Windows remote JSONL subscribe by path.
- Add worker crash behavior: close timeline sockets with retryable reason and let client reconnect.

Exit gate:

- Long JSONL append smoke shows no duplicate paired assistant messages.
- Resume flow still blocks unsafe active processes.
- Android foreground reconnect opens a fresh timeline without stale JSONL.

Rollback:

- Switch `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`; clients reconnect to legacy `/api/timeline`.

## Phase 5: Status v2 Cutover

Goal: move live status polling/broadcast side effects into Status Worker.

Work:

- Move process polling, JSONL watch, hook event application, dismiss/ack handling, Web Push/session history side effects behind Status Worker.
- Keep pure reducer and notification policy output byte-for-byte compatible with current tests.
- Add typed status events for sync/update/remove/hook/session-history/rate-limits.
- Preserve `globalThis` singleton compatibility until custom server and API routes no longer share status state directly.

Exit gate:

- `needs-input`, `ready-for-review`, dismiss, ack, and Web Push smoke pass.
- Session history dedupe still uses `sessionId:turnId`.
- Legacy `/api/status` fallback can be re-enabled without losing current layout metadata.

Rollback:

- Switch `CODEXMUX_RUNTIME_STATUS_V2_MODE=off`; existing `StatusManager` resumes ownership.

## Phase 6: Default Runtime v2

Goal: make v2 the default for new installs and upgraded installs that pass migration gates.

Work:

- Default all surface modes to `default` only after phases 2-5 have shipped independently.
- Keep a documented legacy fallback for at least one release.
- Add release note section for backup, rollback flags, and diagnostic commands.
- Add `corepack pnpm deploy:local` cutover smoke that checks legacy fallback and v2 default.

Exit gate:

- Release branch passes build, lint, typecheck, unit tests, runtime v2 smoke, Electron build, Android debug build, and systemd deploy smoke.
- Production canary shows no worker restart loop, no WebSocket error spike, and no status/timeline duplicate event spike.

## Required Test Commands

```bash
corepack pnpm vitest run tests/unit/lib/runtime tests/unit/lib/status-state-machine.test.ts tests/unit/lib/status-notification-policy.test.ts tests/unit/pages/runtime-v2-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
CODEXMUX_RUNTIME_V2_SMOKE_URL=http://127.0.0.1:8132 node scripts/smoke-runtime-v2.mjs
node scripts/smoke-runtime-v2-phase2-gate.mjs
corepack pnpm build:electron
corepack pnpm android:build:debug
```

## Release Notes Checklist

- Exact flags enabled in this release.
- Data migration mode and backup location.
- Rollback commands.
- Known unsupported legacy/v2 mixed states.
- Smoke result summary with commit SHA and date.
