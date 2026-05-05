# Runtime V2 Phase 6 Default Gate Plan

**Goal:** Add a read-only Phase 6 gate for runtime v2 full default readiness.

**Architecture:** Keep mode ownership in existing env flags. Add a pure validation helper, a small Node smoke wrapper, and docs. The gate reads `/api/v2/runtime/health` and `/api/debug/perf` with existing CLI token auth and reports only modes, check names, and sanitized counter failures.

## Tasks

- [x] Add failing unit tests for Phase 6 gate helper.
- [x] Implement helper validation for mode, worker health, and worker diagnostics counters.
- [x] Add `scripts/smoke-runtime-v2-phase6-default-gate.mjs`.
- [x] Add `smoke:runtime-v2:phase6-default-gate` to `package.json`.
- [x] Update `docs/RUNTIME-V2-CUTOVER.md`, `docs/RUNTIME-V2-PARITY.md`, `docs/TESTING.md`, and `docs/FOLLOW-UP.md`.
- [x] Verify focused unit test and run the live gate.
- [x] Run `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, and `git diff --check`.

## Verification Commands

```bash
corepack pnpm test tests/unit/scripts/runtime-v2-phase6-gate-lib.test.ts
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm tsc --noEmit
corepack pnpm lint
git diff --check
```
