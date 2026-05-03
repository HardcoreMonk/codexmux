# Runtime v2 Startup Diagnostics Design

## Goal

Close the remaining Phase 1 shadow-runtime diagnostic gap: server startup should explicitly call runtime v2 health in a non-blocking path and make worker health visible in `/api/debug/perf`.

## Scope

- Add a small startup diagnostic helper that calls `supervisor.health()` and logs success/failure.
- Replace the server's startup `ensureStarted()` fire-and-forget call with the health diagnostic helper.
- Add worker diagnostics fields for `healthChecks`, `healthFailures`, and `lastHealthAt`.
- Keep legacy startup non-blocking when runtime v2 health fails.
- Update cutover/performance docs with the concrete health fields.

## Non-Goals

- Do not change production route ownership.
- Do not make runtime v2 health a startup blocker.
- Do not expose payloads, session names, cwd, JSONL paths, prompt text, assistant text, or terminal output.

## Behavior

When `CODEXMUX_RUNTIME_V2=1`, server startup schedules `supervisor.health()` without awaiting it. `supervisor.health()` still starts the Supervisor if needed, runs worker readiness, and then sends each worker health command. Worker diagnostics record health command attempts and failures.

If startup health fails, legacy startup continues and the failure is logged. Worker diagnostics carry sanitized failure metadata.

## Tests

- Unit test the startup diagnostic helper is non-blocking and catches failures.
- Unit test worker health commands increment `healthChecks`, `healthFailures`, and `lastHealthAt`.
- Runtime-focused suite, typecheck, lint, build, and runtime v2 smoke.
