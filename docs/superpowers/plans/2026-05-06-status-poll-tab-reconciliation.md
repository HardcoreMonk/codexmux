# Status Poll Tab Reconciliation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move poll tab initial-state and changed-field reconciliation decisions out of `StatusManager`.

**Architecture:** `StatusManager.poll()` keeps workspace/layout/tmux/provider I/O and state mutation. `status/poll-tab-reconciliation.ts` owns deterministic decisions: initial CLI state from persisted/detected provider metadata, synthetic needs-input event baseline, process retry countdown, ports comparison, and broadcast-needed flags.

**Tech Stack:** TypeScript, Vitest, existing status/timeline/terminal types.

---

### Task 1: Poll Tab Reconciliation Helper

**Files:**
- Create: `src/lib/status/poll-tab-reconciliation.ts`
- Test: `tests/unit/lib/status-poll-tab-reconciliation.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover Codex initial state rules, non-Codex persisted state preservation, synthetic needs-input event, process retry countdown, port comparison, and broadcast-needed aggregation.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-poll-tab-reconciliation.test.ts`
Expected: FAIL because `@/lib/status/poll-tab-reconciliation` does not exist.

- [ ] **Step 3: Implement helper**

Create small pure functions with no filesystem, tmux, runtime, or broadcast side effects.

- [ ] **Step 4: Connect StatusManager**

Replace duplicated initial state logic in `scanAll()` and `poll()` and replace inline process retry/ports/summary broadcast condition logic in the existing tab branch.

- [ ] **Step 5: Verify**

Run focused status tests, `tsc`, lint, and full test suite.
