# Status Tab Entry Construction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move initial `ITabStatusEntry` construction out of `StatusManager`.

**Architecture:** `status/tab-entry.ts` builds internal tab status entries from layout tab, pane metadata, detected agent metadata, and already-resolved agent/session fields. `StatusManager` remains responsible for I/O, provider detection, state decisions, persistence, and broadcast.

**Tech Stack:** TypeScript, Vitest, existing terminal/status/tmux types.

---

### Task 1: Tab Entry Builder

**Files:**
- Create: `src/lib/status/tab-entry.ts`
- Test: `tests/unit/lib/status-tab-entry.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover scan restore lifecycle fields, poll-created entry without restored lifecycle fields, explicit tab name override, and pane title formatting fallback.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-tab-entry.test.ts`
Expected: FAIL because `@/lib/status/tab-entry` does not exist.

- [ ] **Step 3: Implement helper**

Create `buildStatusTabEntry()` with a `restoreLifecycleFields` flag.

- [ ] **Step 4: Connect StatusManager**

Use the helper in `scanAll()` and the poll branch for newly discovered tabs.

- [ ] **Step 5: Verify**

Run focused status tests, `tsc`, lint, and full test suite.
