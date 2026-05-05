# Lifecycle Control Actions Design

Date: 2026-05-05
Status: Approved option A

## Goal

Add a constrained executable slice to `/experimental/runtime` without turning the
page into a general shell. The UI may run only named lifecycle actions and must
record operator-visible audit events without storing command output.

## Actions

The first executable actions are:

| Action | Command | Confirmation |
| --- | --- | --- |
| `phase6-gate` | `corepack pnpm smoke:runtime-v2:phase6-default-gate` | none |
| `restart-service` | `systemctl --user restart codexmux.service` | `restart codexmux.service` |
| `deploy-local` | `corepack pnpm deploy:local` | `deploy local` |

The API accepts action ids, not command text. Unknown action ids fail before any
process is spawned. Rollback flag mutation is not part of this slice; the
rollback runbook remains copy-only.

## Safety

- One lifecycle action may run at a time in the server process.
- `restart-service` and `deploy-local` require an exact confirmation phrase.
- Actions use `execFile`/argument arrays, not shell strings.
- Output is not returned to the UI or persisted.
- Failures are represented by status, exit code, duration, and a sanitized error
  class/message.

## Audit

Durable audit file: `~/.codexmux/lifecycle-actions.jsonl`.

Each record stores action id, lifecycle status, timestamps, duration, exit code,
and sanitized failure text. It does not store stdout/stderr, environment, cwd,
token, prompt, terminal output, JSONL path, or session name.

## UI

`LifecycleControlPanel` adds an actions section below the existing read-only
evidence. Each action shows intent, confirmation requirement, disabled/running
state, and the latest audit status. The page refreshes lifecycle evidence after
an action returns. If deploy or restart interrupts the request, the existing
health refresh and service worker/browser reload behavior remain the recovery
path.

## Validation

- Unit tests cover action validation, confirmation, concurrency guard, audit
  redaction, API allowlist behavior, and SSR rendering.
- Existing lifecycle view model and runtime Phase 6 gate tests remain unchanged.
- Manual live execution is not required for this implementation slice.
