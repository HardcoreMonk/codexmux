# Runtime v2 Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define the production cutover path for runtime v2 after Storage, Terminal, Timeline, and Status Worker foundations.

**Architecture:** Cutover is staged by surface area and guarded by independent feature flags. Legacy runtime remains the fallback until each surface has parity, migration, smoke, and rollback evidence. This plan creates the operating document only; it does not flip production defaults.

**Tech Stack:** Next.js Pages Router, custom Node server, runtime v2 Supervisor/Workers, tmux, SQLite, WebSocket APIs, Electron, Android Capacitor.

---

## Files

- Create: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/README.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/superpowers/plans/2026-05-03-runtime-v2-production-cutover.md`

## Tasks

### Task 1: Canonical Cutover Document

- [ ] Create `docs/RUNTIME-V2-CUTOVER.md`.
- [ ] Document current completed foundation and explicit non-cutover areas.
- [ ] Define per-surface flags for storage, terminal, timeline, and status.
- [ ] Split rollout into shadow runtime, terminal new-tabs, storage shadow/default, timeline WebSocket, status live side effects, and final default.
- [ ] Add rollback rules for every phase.

### Task 2: Documentation Map

- [ ] Add `docs/RUNTIME-V2-CUTOVER.md` to `docs/README.md`.
- [ ] Add runtime v2 production cutover to `docs/FOLLOW-UP.md` release checks/backlog.

### Task 3: Verification

- [ ] Run `git diff --check`.
- [ ] Run `corepack pnpm vitest run tests/unit/lib/runtime tests/unit/scripts/runtime-v2-smoke-lib.test.ts`.
- [ ] Run `corepack pnpm tsc --noEmit`.
- [ ] Commit and fast-forward merge to main.

## Self-Review

- Spec coverage: the document covers current state, flags, staged rollout, rollback, and verification.
- Placeholder scan: no TBD/TODO placeholders.
- Type consistency: no code types are introduced in this documentation-only step.
