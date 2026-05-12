# Status Recovery Services Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move resolve-unknown decisions and stop hook recheck scheduling out of `StatusManager`.

**Architecture:** `resolve-unknown-service.ts` returns pure correction decisions after `StatusManager` gathers provider/process/JSONL facts. `stop-recheck-service.ts` owns deferred stop verification and delayed stop snippet refresh scheduling while `StatusManager` keeps JSONL cache mutation, metadata merge, state mutation, and broadcast.

**Tech Stack:** TypeScript, Vitest fake timers, existing status/timeline types.

---

### Task 1: Resolve Unknown Decision Helper

**Files:**
- Create: `src/lib/status/resolve-unknown-service.ts`
- Test: `tests/unit/lib/status-resolve-unknown-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover no-provider idle correction, missing agent process idle correction, JSONL idle completion correction, busy/unknown wait, and non-unknown no-op.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-resolve-unknown-service.test.ts`
Expected: FAIL because `@/lib/status/resolve-unknown-service` does not exist.

- [x] **Step 3: Implement helper and connect manager**

Create `evaluateResolveUnknownStatus()` and use it after existing I/O in `resolveUnknown()`.

### Task 2: Stop Recheck Scheduler

**Files:**
- Create: `src/lib/status/stop-recheck-service.ts`
- Test: `tests/unit/lib/status-stop-recheck-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [x] **Step 1: Write failing tests**

Cover delayed Codex stop recheck, warning on failed recheck, immediate + delayed stop snippet refresh, and JSONL cache clear before delayed refresh.

- [x] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-stop-recheck-service.test.ts`
Expected: FAIL because `@/lib/status/stop-recheck-service` does not exist.

- [x] **Step 3: Implement service and connect manager**

Create `StatusStopRecheckService` with injected callbacks for recheck, refresh snippet, cache clear, and warning.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] **Step 1: Update docs**

Document resolve-unknown decision and stop recheck scheduling helpers.

- [x] **Step 2: Verify**

Run focused status tests, `tsc`, lint, full test suite, and placeholder scan.
