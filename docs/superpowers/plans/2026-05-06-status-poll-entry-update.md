# Status Poll Entry Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move existing-tab poll field mutation out of `StatusManager.poll()`.

**Architecture:** `poll-tab-entry-update.ts` owns applying a layout/pane/provider snapshot to an existing `ITabStatusEntry`. `StatusManager.poll()` keeps provider metadata reads, JSONL metadata merge, Codex state reconciliation, stuck-busy recovery, pane prompt recovery, persistence, and broadcast side effects.

**Tech Stack:** TypeScript, Vitest, existing status/terminal types.

---

### Task 1: Existing Poll Entry Update Helper

**Files:**
- Create: `src/lib/status/poll-tab-entry-update.ts`
- Test: `tests/unit/lib/status-poll-tab-entry-update.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover pane-title tab name fallback, layout/process/session/jsonl/user-message field updates, terminal field updates when the reconciliation result says terminal data changed, summary updates when changed, and retention of existing JSONL path when refreshed metadata does not provide one.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-poll-tab-entry-update.test.ts`
Expected: FAIL because `@/lib/status/poll-tab-entry-update` does not exist.

- [x] **Step 3: Implement helper and connect poll**

Create `applyStatusPollTabEntryUpdate()` and replace the equivalent existing-tab field mutation block in `StatusManager.poll()`.

### Task 2: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document the existing-tab poll entry update helper in the status architecture and related files table. Update the follow-up architecture line so poll per-tab mutation body is no longer listed as pending.

- [x] **Step 2: Verify**

Run focused status tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and a placeholder scan over changed files.
