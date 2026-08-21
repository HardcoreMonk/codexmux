# Ops Automation Batch Handoff

Date: 2026-05-06

## Implemented

- Added a manual `Platform Smoke Artifacts` workflow for browser, Electron runtime v2, and self-hosted Android smoke JSON artifacts.
- Added shared stats session parse reuse so projects/sessions requests can share one period parse through a 60s in-process TTL and in-flight promise.
- Connected approval needs-input Web Push lock-screen copy to sanitized parsed prompt metadata when pane recovery has metadata.
- Added `corepack pnpm lifecycle:rollback-dry-run` for read-only runtime v2 rollback command/evidence output.
- Added `corepack pnpm smoke:ops:batch` for local operations smoke evidence with explicit `manual-required` rows for hardware-dependent checks.
- Added `corepack pnpm ops:automation:batch` for a six-item operations automation run across artifact workflow validation, perf evidence, approval tests, lifecycle dry-run evidence, nested smoke evidence, and Post-MVP deferral docs.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/lib/stats-codex.test.ts` | passed, 1 file / 3 tests |
| `corepack pnpm test tests/unit/lib/approval-queue.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/status-worker-service.test.ts` | passed, 3 files / 33 tests |
| `node --check scripts/lifecycle-rollback-dry-run-lib.mjs` | passed |
| `node --check scripts/lifecycle-rollback-dry-run.mjs` | passed |
| `node --check scripts/ops-smoke-batch.mjs` | passed |
| `corepack pnpm lifecycle:rollback-dry-run` | passed, `"mutates": false`, runtime v2 drop-in detected |
| `node --check scripts/ops-automation-batch-lib.mjs` | passed |
| `node --check scripts/ops-automation-batch.mjs` | passed |
| `corepack pnpm test tests/unit/scripts/ops-automation-batch-lib.test.ts` | passed, 1 file / 6 tests |
| `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-ops-automation-20260506-0142 CODEXMUX_OPS_AUTOMATION_URL=http://127.0.0.1:8122 corepack pnpm ops:automation:batch` | passed, 6/6 rows passed; iPad and Mac rows remain nested `manualRequired` |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm test` | passed, 109 files / 556 tests |

## Remaining External Evidence

- Android self-hosted runner provisioning or manual Android device smoke artifacts.
- Real iPad/PWA long-background evidence.
- Mac packaged UX evidence from an actual packaged app session.
- Rollback mutation, systemd drop-in editing, and rollback drill automation under a separate spec.

## Notes

- The new platform workflow is manual and does not change tag release blocking behavior.
- The ops smoke batch does not fake hardware evidence; unavailable hardware checks stay `manual-required`.
- The lifecycle rollback dry-run prints the rollback commands but does not delete files or run `systemctl`.
