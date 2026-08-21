# Backlog Batch Runner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a safe `ops:backlog:batch-run` command that executes only automated backlog rows by default.

**Architecture:** The runner consumes the existing backlog plan library, derives a deduplicated command list, executes `corepack pnpm ...` commands sequentially, and writes sanitized smoke artifacts. Conditional/manual/spec-required rows are recorded as skipped unless conditional mode is explicitly enabled.

**Tech Stack:** Node.js ESM scripts, Vitest, existing smoke artifact sanitizer, pnpm scripts.

---

### Task 1: Runner Helper

**Files:**
- Create: `scripts/ops-backlog-batch-run-lib.mjs`
- Test: `tests/unit/scripts/ops-backlog-batch-run-lib.test.ts`

- [x] **Step 1: Write failing tests**

Test command selection, conditional exclusion, skipped rows, and result summary.

- [x] **Step 2: Run test to verify RED**

Run: `corepack pnpm test tests/unit/scripts/ops-backlog-batch-run-lib.test.ts`
Expected: FAIL because `scripts/ops-backlog-batch-run-lib.mjs` does not exist.

- [x] **Step 3: Implement helper**

Add `buildBacklogBatchRunPlan`, `parseCorepackPnpmCommand`, and
`summarizeBatchRunResults`.

- [x] **Step 4: Verify helper**

Run: `corepack pnpm test tests/unit/scripts/ops-backlog-batch-run-lib.test.ts`
Expected: PASS.

### Task 2: Runner CLI And Docs

**Files:**
- Create: `scripts/ops-backlog-batch-run.mjs`
- Modify: `package.json`
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/superpowers/specs/2026-05-06-backlog-batch-runner-design.md`

- [x] **Step 1: Implement CLI**

Add sequential execution, dry-run, continue-on-failure, conditional include flag, and smoke artifact
output.

- [x] **Step 2: Add package script**

Add `ops:backlog:batch-run`.

- [x] **Step 3: Update docs**

Document default safety behavior and environment switches.

- [x] **Step 4: Verify**

Run syntax checks, unit tests, dry-run, typecheck, lint, and diff whitespace check.
