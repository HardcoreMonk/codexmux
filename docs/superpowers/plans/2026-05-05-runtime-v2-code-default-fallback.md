# Runtime V2 Code Default Fallback Plan

**Goal:** Make runtime v2 surface modes default in code when `CODEXMUX_RUNTIME_V2=1` and per-surface mode env vars are unset.

**Architecture:** Add resolved mode helpers beside existing raw parsers. Raw parsers still fail closed. `getRuntime*V2Mode()` and ownership predicates use resolved modes, so health reporting and behavior align.

## Tasks

- [x] Add failing tests for unset mode fallback across terminal/storage/timeline/status.
- [x] Add health route test for Phase 6 fallback modes.
- [x] Implement resolved mode helpers and switch ownership predicates to them.
- [x] Update ADR, STATUS, cutover/parity/testing/follow-up/systemd docs.
- [x] Run focused unit tests, Phase 6 gate, typecheck, lint, build, and diff check.

## Verification Commands

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-mode.test.ts tests/unit/lib/runtime/storage-mode.test.ts tests/unit/lib/runtime/timeline-mode.test.ts tests/unit/lib/runtime/status-mode.test.ts tests/unit/pages/runtime-v2-api.test.ts
corepack pnpm smoke:runtime-v2:phase6-default-gate
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
git diff --check
```
