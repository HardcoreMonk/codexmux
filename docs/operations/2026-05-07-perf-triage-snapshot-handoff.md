# Perf Triage Snapshot Handoff

Date: 2026-05-07

## Implemented

- Added a pure perf triage classifier for `/api/debug/perf` snapshots.
- `/api/debug/perf` now returns `triage.summary` and `triage.items` alongside the existing runtime/services payload.
- Triage classifies stats, diff, timeline, status, terminal, session index, runtime worker, and event loop candidates using numeric timing/counter evidence only.
- Runtime worker failure counters are promoted to high severity.
- `ops:automation:batch` includes `triageSummary` and `topTriage` in its perf row artifact.

## Safety

- Triage output contains metric names, severity, reason, impact score, and numeric evidence.
- It does not include cwd, session id/name, JSONL path, prompts, assistant text, terminal output, command bodies, or worker error detail.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts` | passed, 1 file / 4 tests |
| `corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts tests/unit/pages/debug-perf.test.ts` | passed, 2 files / 6 tests |
| `corepack pnpm vitest run tests/unit/scripts/ops-automation-batch-lib.test.ts` | passed, 1 file / 6 tests |
| `corepack pnpm vitest run tests/unit/lib/perf-triage.test.ts tests/unit/pages/debug-perf.test.ts tests/unit/scripts/ops-automation-batch-lib.test.ts` | passed, 3 files / 12 tests |
| `node --check scripts/ops-automation-batch-lib.mjs` | passed |
| `node --check scripts/ops-automation-batch.mjs` | passed |
| `corepack pnpm tsc --noEmit` | passed |
| `corepack pnpm lint` | passed |
| `corepack pnpm test` | passed, 144 files / 694 tests |

## Follow-Up

- Run the full verification set before release.
- Use live `triage.topTriage` to choose the next code slice. Do not enable status adaptive scheduling or timeline windowing until triage points there with repeatable evidence.
