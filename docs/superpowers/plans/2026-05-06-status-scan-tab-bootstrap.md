# Status Scan Tab Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `scanAll()` poll-created tab bootstrap entry/action construction out of `StatusManager`.

**Architecture:** `scan-tab-bootstrap.ts` receives already-read tab, provider, pane, terminal, and metadata signals, then returns the initial `ITabStatusEntry` plus bootstrap action flags. `StatusManager.scanAll()` keeps tmux/layout/provider I/O and executes side effects such as JSONL watch start, pane recovery, and unknown resolution.

**Tech Stack:** TypeScript, Vitest, existing status/terminal types.

---

### Task 1: Scan Tab Bootstrap Helper

**Files:**
- Create: `src/lib/status/scan-tab-bootstrap.ts`
- Test: `tests/unit/lib/status-scan-tab-bootstrap.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover initial state resolution, restored lifecycle fields, synthetic needs-input baseline event, JSONL watch action flags for Codex and unknown/needs-input states, Codex pane recovery action flag, and unknown resolution flag.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-scan-tab-bootstrap.test.ts`
Expected: FAIL because `@/lib/status/scan-tab-bootstrap` does not exist.

- [x] **Step 3: Implement helper and connect scanAll**

Create `buildStatusScanTabBootstrap()` and replace the equivalent entry/action construction block in `StatusManager.scanAll()`.

### Task 2: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document the scan tab bootstrap helper in the status architecture and related files table. Update the follow-up architecture line so scanAll bootstrap body is no longer listed as pending.

- [x] **Step 2: Verify**

Run focused status tests, `corepack pnpm tsc --noEmit`, `corepack pnpm lint`, `corepack pnpm test`, `corepack pnpm build`, `git diff --check`, and a placeholder scan over changed files.
