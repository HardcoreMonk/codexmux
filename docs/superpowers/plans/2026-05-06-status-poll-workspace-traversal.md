# Status Poll Workspace Traversal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move status poll workspace/layout traversal out of `StatusManager`.

**Architecture:** `status-poll-workspace-traversal.ts` receives the current workspace list and an injected layout reader, then returns ordered poll tab rows, known tab ids, and traversal counts. `StatusManager.poll()` keeps tmux/process/provider metadata reads, state mutation, recovery, broadcast, and poll metrics reporting.

**Tech Stack:** TypeScript, Vitest, existing workspace/layout types.

---

### Task 1: Poll Workspace Traversal Helper

**Files:**
- Create: `src/lib/status/poll-workspace-traversal.ts`
- Test: `tests/unit/lib/status-poll-workspace-traversal.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover workspace count, missing layout skip, tab ordering, scanned tab count, and known tab id collection.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-poll-workspace-traversal.test.ts`
Expected: FAIL because `@/lib/status/poll-workspace-traversal` does not exist.

- [x] **Step 3: Implement helper and connect poll**

Create `collectStatusPollWorkspaceTabs()` and replace direct `readLayoutFile(resolveLayoutFile(ws.id))` plus `collectAllTabs(layout.root)` traversal inside `StatusManager.poll()`.

### Task 2: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document the poll workspace traversal helper in the status architecture and related files table. Update the follow-up architecture line so poll traversal is no longer listed as pending.

- [x] **Step 2: Verify**

Run focused status tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and a placeholder scan over changed files.
