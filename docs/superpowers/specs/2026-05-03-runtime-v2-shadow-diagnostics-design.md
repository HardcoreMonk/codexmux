# Runtime v2 Shadow Diagnostics Design

## Goal

Phase 0 parity inventory와 Phase 1 shadow runtime 진단 기반을 구현한다. production user-facing route는 그대로 legacy에 두고, `CODEXMUX_RUNTIME_V2=1` 상태에서 Supervisor/Worker runtime의 readiness, restart, timeout, command failure를 `/api/debug/perf`로 관측할 수 있게 한다.

## Scope

- Add a canonical parity matrix document for runtime v2 cutover readiness.
- Track per-worker diagnostics for Storage, Terminal, Timeline, and Status Worker.
- Expose diagnostics through the existing authenticated `/api/debug/perf` snapshot.
- Keep diagnostics free of cwd, session id/name, JSONL path, prompt, assistant text, and terminal output.
- Update cutover/performance/follow-up docs to reference the concrete snapshot fields.

## Non-Goals

- Do not flip any runtime v2 production default.
- Do not replace `/api/terminal`, `/api/timeline`, `/api/status`, or `/api/sync`.
- Do not add a public health endpoint.
- Do not expose command payloads or runtime identifiers in diagnostics.

## Architecture

- `RuntimeWorkerClient` records lifecycle and command counters in a `globalThis.__ptRuntimeWorkerDiagnostics` store.
- Counters are keyed by worker name only: `storage`, `terminal`, `timeline`, `status`.
- The diagnostics store exposes snapshot and test reset helpers.
- `/api/debug/perf` returns worker diagnostics under `services.runtimeWorkers`.
- Supervisor startup remains unchanged; worker readiness failures still fail the v2 path while legacy routes remain available.

## Diagnostic Fields

Each worker snapshot includes numeric counters and sanitized last error/exit metadata:

- `starts`
- `readyChecks`
- `readyFailures`
- `requests`
- `replies`
- `events`
- `commandFailures`
- `invalidReplies`
- `timeouts`
- `sendFailures`
- `exits`
- `errors`
- `restarts`
- `shutdowns`
- `lastError`
- `lastExit`
- `lastStartedAt`
- `lastReadyAt`
- `lastRequestAt`
- `lastFailureAt`
- `lastRestartAt`
- `lastShutdownAt`

`lastError` stores only `code`, `message`, `retryable`, and `at`. It must not store payloads, session names, cwd, JSONL paths, prompts, assistant text, or terminal output.

## Tests

- Unit test the diagnostics store snapshot/reset behavior.
- Unit test `RuntimeWorkerClient` counters for request/reply, timeout, readiness failure, and restart scheduling.
- Unit test `/api/debug/perf` includes `services.runtimeWorkers` and still excludes sensitive keys.

## Rollback

Diagnostics are passive. Rollback is removing the `/api/debug/perf` field or setting `CODEXMUX_RUNTIME_V2=0`; legacy production routes are unchanged.
