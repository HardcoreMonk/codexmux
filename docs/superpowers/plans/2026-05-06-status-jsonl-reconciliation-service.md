# Status JSONL Reconciliation Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move JSONL file-change watch/recovery predicates out of `StatusManager`.

**Architecture:** `jsonl-reconciliation-service.ts` provides pure predicates for whether a JSONL watch should remain active, whether a fresh JSONL interrupt should emit a synthetic hook event, and whether a delayed permission/input pane recovery should be scheduled after a tool action appears. `StatusManager` keeps file reads, JSONL metadata merge, Codex state mutation, pane capture recovery, and broadcast side effects.

**Tech Stack:** TypeScript, Vitest, existing status/timeline types.

---

### Task 1: JSONL Reconciliation Predicates

**Files:**
- Create: `src/lib/status/jsonl-reconciliation-service.ts`
- Test: `tests/unit/lib/status-jsonl-reconciliation-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover active watch retention for active states and Codex tabs, inactive non-Codex watch stop, synthetic interrupt freshness, stale interrupt suppression, and delayed pane recovery scheduling for busy tool actions.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-jsonl-reconciliation-service.test.ts`
Expected: FAIL because `@/lib/status/jsonl-reconciliation-service` does not exist.

- [x] **Step 3: Implement predicates and connect manager**

Create `shouldKeepStatusJsonlWatch()`, `shouldEmitSyntheticJsonlInterrupt()`, and `shouldScheduleDelayedJsonlInputRecovery()`. Replace the equivalent inline conditions in `StatusManager.onJsonlFileChange()`.

### Task 2: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document the JSONL reconciliation predicate helper in the status architecture and related files table. Update the follow-up architecture line so this split is no longer listed as pending.

- [x] **Step 2: Verify**

Run focused status tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and a placeholder scan over changed files.
