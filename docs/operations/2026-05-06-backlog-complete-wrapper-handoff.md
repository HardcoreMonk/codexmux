# Backlog Complete Wrapper Handoff

Date: 2026-05-06

## Summary

- Added `corepack pnpm ops:backlog:completion-manifest`.
- Added `corepack pnpm ops:backlog:complete`.
- `completion-manifest` creates the manifest consumed by the existing completion gate.
- `complete` runs the automated backlog batch, writes the manifest, then runs the completion gate.

## Closeout Rules

- Without `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1`, manual/external rows stay open.
- With `CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1`, unavailable hardware/external/manual rows can be
  closed as `approved-deferred` only when owner, reason, and revisit trigger are present.
- Android timeline foreground remains open as real evidence because the v0.4.6 default smoke did not
  fully pass. The wrapper can close it only as approved defer, not as passed evidence.
- Spec-required rows link to
  `docs/superpowers/specs/2026-05-06-spec-required-backlog-kickoff.md`.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/scripts/ops-backlog-completion-manifest-lib.test.ts tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts` | passed, 2 files / 7 tests |
| `node --check scripts/ops-backlog-completion-manifest-lib.mjs` | passed |
| `node --check scripts/ops-backlog-completion-manifest.mjs` | passed |
| `node --check scripts/ops-backlog-complete.mjs` | passed |
| `CODEXMUX_BACKLOG_COMPLETE_SKIP_BATCH_RUN=1 CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-20260506-completion corepack pnpm ops:backlog:complete` | expected failure, `completionPercent=70`, 12 manual/external rows incomplete |
| `CODEXMUX_BACKLOG_COMPLETE_SKIP_BATCH_RUN=1 CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-run-20260506-completion corepack pnpm ops:backlog:complete` | passed, `completionPercent=100`, `closable=true`, 17 passed, 2 evidence-attached, 9 spec-linked, 12 approved-deferred |
| `corepack pnpm test` | passed, 142 files / 687 tests |
| `corepack pnpm lint` | passed |
| `corepack pnpm tsc --noEmit` | passed |
| `git diff --check` | passed |

## Operation Notes

Use this command for an explicit full closeout:

```bash
CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete \
corepack pnpm ops:backlog:complete
```

Use `CODEXMUX_BACKLOG_COMPLETE_SKIP_BATCH_RUN=1` only when reusing a known-good
`ops-backlog-batch-run` artifact in the same `CODEXMUX_SMOKE_ARTIFACT_DIR`.
