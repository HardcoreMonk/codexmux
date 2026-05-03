# Runtime v2 Phase 2 Gate Smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Phase 2 gate smoke that proves new v2 tabs survive app-surface reload and server restart while legacy tabs stay on the legacy terminal route, then document the remaining Electron/Android platform gates before Phase 3.

**Architecture:** Add a self-managed Node smoke script that starts codexmux with a temp HOME/DB, performs onboarding/login to get a normal session cookie, creates a legacy workspace plus a v2 plain terminal tab through the existing app layout API, re-reads layout to simulate browser reload, restarts the server, and re-attaches both legacy and v2 tabs. Add small script helper functions with unit tests. Runtime health exposes the terminal v2 mode so client preflight and smoke can distinguish `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off` rollback from a healthy new-tabs mode.

**Tech Stack:** Node ESM scripts, `ws`, Next.js Pages Router APIs, runtime v2 Supervisor/Workers, Vitest, TypeScript docs.

---

## Files

- Create: `scripts/runtime-v2-phase2-smoke-lib.mjs`
- Create: `scripts/smoke-runtime-v2-phase2-gate.mjs`
- Create: `tests/unit/scripts/runtime-v2-phase2-smoke-lib.test.ts`
- Modify: `src/pages/api/v2/runtime/health.ts`
- Modify: `src/lib/terminal-runtime-preflight.ts`
- Modify: `src/lib/runtime/session-name.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- Modify: `tests/unit/pages/runtime-v2-api.test.ts`
- Modify: `tests/unit/lib/terminal-runtime-preflight.test.ts`
- Modify: `tests/unit/lib/runtime/session-name.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/FOLLOW-UP.md`
- Modify: `docs/ELECTRON.md`
- Modify: `docs/ANDROID.md`

## Tasks

### Task 1: Phase 2 Smoke Helper Library

- [x] Add failing helper tests for recursive pane/tab collection, endpoint selection from `runtimeVersion`, WebSocket URL construction, and `Set-Cookie` extraction.
- [x] Run `corepack pnpm vitest run tests/unit/scripts/runtime-v2-phase2-smoke-lib.test.ts` and confirm the helper module is missing.
- [x] Implement `scripts/runtime-v2-phase2-smoke-lib.mjs`.
- [x] Re-run the helper tests and confirm they pass.

### Task 2: Terminal Mode-Aware Runtime Health

- [x] Add failing route and preflight tests proving health returns `terminalV2Mode` and `preflightTerminalRuntime()` returns `runtime-v2-disabled` when mode is `off`.
- [x] Update `/api/v2/runtime/health` to include `terminalV2Mode`.
- [x] Update `src/lib/terminal-runtime-preflight.ts` to treat health `{ terminalV2Mode: 'off' }` as the rollback diagnostic for v2 terminal tabs.
- [x] Run `corepack pnpm vitest run tests/unit/pages/runtime-v2-api.test.ts tests/unit/lib/terminal-runtime-preflight.test.ts`.

### Task 3: Browser Reload And Server Restart Gate Smoke

- [x] Implement `scripts/smoke-runtime-v2-phase2-gate.mjs` with a managed dev server lifecycle.
- [x] In the script, create a workspace via `/api/workspace`, verify its default tab is legacy, then create a plain tab via `/api/layout/pane/:paneId/tabs` and verify `runtimeVersion: 2`.
- [x] Simulate browser reload by re-reading `/api/layout?workspace=:id` and re-attaching the v2 tab through `/api/v2/terminal`.
- [x] Restart the server with the same HOME/DB and verify both the legacy tab and v2 tab reattach through their expected WebSocket endpoints.
- [x] Restart with `CODEXMUX_RUNTIME_TERMINAL_V2_MODE=off`, verify a new plain tab is legacy, and verify runtime health exposes terminal mode `off`.
- [x] Run `node --check scripts/smoke-runtime-v2-phase2-gate.mjs`.
- [x] Run `node scripts/smoke-runtime-v2-phase2-gate.mjs`.

### Task 4: Docs And Platform Gates

- [x] Update cutover/parity/follow-up docs with the new gate smoke command and the remaining Electron/Android manual evidence.
- [x] Update Electron and Android docs so their smoke checklists reference the server gate command, cookie-auth expectation, foreground reconnect, and rollback mode-off behavior.

### Task 5: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run `corepack pnpm vitest run tests/unit/scripts/runtime-v2-phase2-smoke-lib.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts tests/unit/lib/terminal-runtime-preflight.test.ts tests/unit/pages/runtime-v2-api.test.ts`.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/layout-tabs-api.test.ts tests/unit/scripts/runtime-v2-phase2-smoke-lib.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run `node scripts/smoke-runtime-v2-phase2-gate.mjs`.
- [ ] Commit, fast-forward merge to main, push, and clean up worktree.
