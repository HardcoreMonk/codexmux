# Runtime v2 Terminal Mode Identity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make terminal tab runtime ownership explicit before routing new tabs through runtime v2.

**Architecture:** Add `runtimeVersion` to shared tab types and runtime v2 contracts while preserving backward compatibility for existing JSON layout files. Runtime v2 storage always emits `runtimeVersion: 2`; legacy tab creation emits `runtimeVersion: 1`. A small feature flag helper parses terminal v2 modes but does not switch production routing yet.

**Tech Stack:** TypeScript, Next.js Pages Router API routes, runtime v2 Storage/Supervisor, Vitest.

---

## Files

- Create: `src/lib/runtime/terminal-mode.ts`
- Modify: `src/types/terminal.ts`
- Modify: `src/lib/layout-store.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/storage/repository.ts`
- Modify: `tests/unit/lib/runtime/storage-repository.test.ts`
- Modify: `tests/unit/pages/runtime-v2-api.test.ts`
- Create: `tests/unit/lib/runtime/terminal-mode.test.ts`
- Modify: `tests/unit/lib/layout-store.test.ts`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/TMUX.md`
- Create: `docs/superpowers/specs/2026-05-03-runtime-v2-terminal-mode-identity-design.md`
- Create: `docs/superpowers/plans/2026-05-03-runtime-v2-terminal-mode-identity.md`

## Tasks

### Task 1: TDD Terminal Mode Helper

- [x] Add failing tests for parsing `CODEXMUX_RUNTIME_TERMINAL_V2_MODE`.
- [x] Implement `src/lib/runtime/terminal-mode.ts`.
- [x] Run the terminal mode helper test.

### Task 2: TDD Runtime Version In Contracts

- [x] Add failing tests for runtime v2 repository/API tab `runtimeVersion: 2`.
- [x] Add `runtimeVersion` types and repository mapping.
- [x] Run runtime storage/API tests.

### Task 3: TDD Legacy New Tab Identity

- [x] Add failing test or targeted assertion for legacy `addTabToPane()` returning `runtimeVersion: 1`.
- [x] Update legacy layout-store tab creation.
- [x] Run the focused layout test.

### Task 4: Docs

- [x] Document that missing `runtimeVersion` means legacy runtime 1.
- [x] Document that terminal mode helper exists but production routing is unchanged.

### Task 5: Verification And Integration

- [x] Run `git diff --check`.
- [x] Run targeted tests for terminal mode, runtime storage/API, and layout tab creation.
- [x] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/pages/runtime-v2-api.test.ts tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [x] Run `corepack pnpm tsc --noEmit`.
- [x] Run `corepack pnpm lint`.
- [x] Run `corepack pnpm build`.
- [x] Run runtime v2 smoke against temp HOME/DB.
- [ ] Commit, fast-forward merge to main, push, and clean up worktree.
