# Backlog Batch Runner Design

## Goal

Add a safe runner for the existing full backlog batch plan. The runner should automate local,
already-scripted backlog checks while making release mutation, hardware checks, manual UX evidence,
and spec-required work explicit skipped rows by default.

## Design

`corepack pnpm ops:backlog:batch-run` consumes `ops-backlog-batch-plan-lib.mjs` instead of
duplicating backlog definitions. It selects rows with `execution: "automated"`, deduplicates their
`corepack pnpm ...` commands, runs them sequentially, stops on first failure, and writes a sanitized
`ops-backlog-batch-run` artifact. `conditional`, `manual-required`, and `spec-required` rows are
recorded in the artifact as skipped.

The runner supports three environment switches:

- `CODEXMUX_BACKLOG_BATCH_DRY_RUN=1`: print and artifact the plan without running commands.
- `CODEXMUX_BACKLOG_BATCH_CONTINUE_ON_FAILURE=1`: keep running after a failed command.
- `CODEXMUX_BACKLOG_BATCH_INCLUDE_CONDITIONAL=1`: include conditional rows for an explicit
  release/device window.

## Safety

The default runner must not run `release:patch`, deploy/restart, rollback mutation, Android device
smokes, iPad/Mac manual UX checks, or undefined spec-required implementation work. Conditional mode
is intentionally opt-in because it can include release mutation and Android-device commands.

## Verification

Unit tests cover command selection, dedupe, skipped rows, and result summary. Runtime verification
uses `CODEXMUX_BACKLOG_BATCH_DRY_RUN=1` first, then the normal runner only when a full automated
batch is intended.
