# Full Backlog Batch Plan Handoff

Date: 2026-05-06

## Implemented

- Added `corepack pnpm ops:backlog:batch-plan`.
- Added a read-only backlog planner that maps the full remaining work list into eight batch lanes.
- Classified every row as `automated`, `conditional`, `manual-required`, or `spec-required`.
- Added validation for stable batch ids, unique item slugs, required backlog coverage, and safe
  `corepack pnpm ...` command prefixes.
- Updated testing and follow-up docs so the planner sits above the existing six-item
  `ops:automation:batch`.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts` | passed, 1 file / 4 tests |
| `node --check scripts/ops-backlog-batch-plan-lib.mjs` | passed |
| `node --check scripts/ops-backlog-batch-plan.mjs` | passed |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-batch-plan-20260506 corepack pnpm ops:backlog:batch-plan` | passed, 8 batch lanes / 40 rows / validation ok |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `git diff --check` | passed |
| `corepack pnpm test` | passed, 139 files / 676 tests |

## Notes

- The planner is not a runner for destructive or external checks.
- Release bumps, deploy/restart, live rollback, Play Console upload, packaged Mac UX, and real
  iPad/PWA long-background checks remain explicit human/operator actions.
