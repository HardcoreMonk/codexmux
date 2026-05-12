# Backlog Completion Gate Handoff

Date: 2026-05-06

## Summary

- Added `corepack pnpm ops:backlog:completion-gate`.
- Added `scripts/ops-backlog-completion-gate-lib.mjs` to resolve every backlog row to a terminal
  completion state.
- Added `scripts/ops-backlog-completion-gate.mjs` to read batch-run artifacts, read an optional
  evidence manifest, print JSON, and write a sanitized `ops-backlog-completion-gate` artifact.
- Added unit coverage for skipped-row rejection, 100% closed fixture manifests, manifest
  validation, and artifact/manifest discovery.

## Safety Boundary

The completion gate is read-only. It does not run release mutation, deploy/restart, lifecycle
mutation, Android commands, Play Console actions, iPad/macOS UX checks, or remote service changes.
Skipped rows remain incomplete unless a manifest entry supplies sanitized evidence, a spec link, or
an approved defer with owner, reason, and revisit trigger.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts` | passed, 1 file / 4 tests |
| `node --check scripts/ops-backlog-completion-gate-lib.mjs` | passed |
| `node --check scripts/ops-backlog-completion-gate.mjs` | passed |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-completion-incomplete-20260506 CODEXMUX_BACKLOG_COMPLETION_DRY_RUN=1 corepack pnpm ops:backlog:completion-gate` | expected failure, `completionPercent=0`, `closable=false`, 40 incomplete rows |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-completion-closed-20260506 CODEXMUX_BACKLOG_COMPLETION_MANIFEST=/tmp/codexmux-backlog-completion-closed-20260506/manifest.json corepack pnpm ops:backlog:completion-gate` | passed, fixture `completionPercent=100`, `closable=true`, 40 completed rows |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-20260506-completion corepack pnpm ops:backlog:batch-run` | passed, 17/17 commands passed, 24 skipped rows |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-20260506-completion CODEXMUX_BACKLOG_COMPLETION_DRY_RUN=1 corepack pnpm ops:backlog:completion-gate` | expected failure, 17 passed rows, 23 incomplete rows, `completionPercent=42`, `closable=false` |

## Follow-Up

- Run an incomplete gate smoke after the next automated batch to prove it exits non-zero while
  manual/spec evidence is missing.
- Add a project-local manifest only when manual evidence, spec links, or approved defers are ready
  to close those rows.
