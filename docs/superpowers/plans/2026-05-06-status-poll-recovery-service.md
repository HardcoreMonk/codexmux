# Status Poll Recovery Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move status poll stuck-busy and pane recovery orchestration out of `StatusManager.poll()`.

**Architecture:** `poll-recovery-service.ts` owns busy-stuck eligibility, process-gone recovery execution, Codex pane recovery ordering, and post-recovery broadcast action decisions. `StatusManager.poll()` keeps concrete callbacks for process child lookup, CLI state mutation, layout persistence, broadcast, and pane capture recovery.

**Tech Stack:** TypeScript, Vitest, existing status/tmux/provider types.

---

### Task 1: Poll Recovery Service

**Files:**
- Create: `src/lib/status/poll-recovery-service.ts`
- Test: `tests/unit/lib/status-poll-recovery-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover busy-stuck eligibility, no-op for fresh busy events, forcing idle when the agent process is gone, skipping idle when the agent still runs, Codex pane recovery ordering, non-Codex recovery skip, and post-recovery broadcast action resolution.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-poll-recovery-service.test.ts`
Expected: FAIL because `@/lib/status/poll-recovery-service` does not exist.

- [x] **Step 3: Implement service and connect poll**

Create `StatusPollRecoveryService`, `shouldCheckStatusPollBusyStuck()`, `recoverStatusPollPaneInput()`, and `resolveStatusPollUpdateAction()`. Replace the equivalent stuck-busy and pane recovery block in `StatusManager.poll()`.

### Task 2: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document the poll recovery service in the status architecture and related files table. Update the follow-up architecture line so stuck-busy/recovery body is no longer listed as pending.

- [x] **Step 2: Verify**

Run focused status tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and a placeholder scan over changed files.
