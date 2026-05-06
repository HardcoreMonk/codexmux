# Backlog Batch Runner Handoff

Date: 2026-05-06

## Implemented

- Added `corepack pnpm ops:backlog:batch-run`.
- Added a runner helper that consumes the existing full backlog batch plan.
- Default run includes only `automated` rows, deduplicates commands, and skips `conditional`,
  `manual-required`, and `spec-required` rows.
- Added environment switches:
  - `CODEXMUX_BACKLOG_BATCH_DRY_RUN=1`
  - `CODEXMUX_BACKLOG_BATCH_CONTINUE_ON_FAILURE=1`
  - `CODEXMUX_BACKLOG_BATCH_INCLUDE_CONDITIONAL=1`
- Added sanitized `ops-backlog-batch-run` artifact output.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/scripts/ops-backlog-batch-run-lib.test.ts` | passed, 1 file / 4 tests |
| `node --check scripts/ops-backlog-batch-run-lib.mjs` | passed |
| `node --check scripts/ops-backlog-batch-run.mjs` | passed |
| `corepack pnpm test tests/unit/scripts/ops-backlog-batch-run-lib.test.ts tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts` | passed, 2 files / 8 tests |
| `CODEXMUX_BACKLOG_BATCH_DRY_RUN=1 CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-dry-20260506 corepack pnpm ops:backlog:batch-run` | passed, 17 planned commands / 24 skipped rows |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-20260506-rerun corepack pnpm ops:backlog:batch-run` | passed, 17/17 commands passed / 24 skipped rows |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm test` | passed, 140 files / 680 tests |
| `git diff --check` | passed |

## Runtime Note

The first real runner attempt stopped correctly on `corepack pnpm smoke:permission` after a temp
permission smoke server startup timeout. A standalone `corepack pnpm smoke:permission` immediately
passed, and the full runner rerun passed. This confirms the runner failure path and stop-on-first
failure behavior, while leaving the transient smoke startup timeout as operational evidence rather
than a code defect in the runner.

## Skipped By Default

- Release mutation and release metadata checks.
- Android device smokes unless conditional mode is explicitly enabled.
- iPad/Mac manual UX evidence.
- Rollback mutation and other spec-required implementation work.
