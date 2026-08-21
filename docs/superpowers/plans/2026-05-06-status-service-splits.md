# Status Service Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split poll scheduling/snapshot, pane recovery, and session history persistence fallback out of `StatusManager`.

**Architecture:** `StatusManager` remains the owner of live tab state and orchestration. New status helpers own deterministic service boundaries: poll interval/snapshot/timer lifecycle, Codex pane recovery decision generation, and runtime-v2-to-legacy session history persistence fallback.

**Tech Stack:** TypeScript, Vitest, existing status/runtime helpers, Next.js Pages Router server code.

---

### Task 1: Poll Service

**Files:**
- Create: `src/lib/status/poll-service.ts`
- Test: `tests/unit/lib/status-poll-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover interval thresholds, snapshot creation, timer start/stop, and interval refresh.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-poll-service.test.ts`
Expected: FAIL because `@/lib/status/poll-service` does not exist.

- [ ] **Step 3: Implement service and connect manager**

Move poll constants, `IStatusPollSnapshot`, timer lifecycle, current interval, last snapshot, and duration recording into the service. Keep the existing `StatusManager.poll()` loop behavior unchanged.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm test tests/unit/lib/status-poll-service.test.ts`
Expected: PASS.

### Task 2: Pane Recovery Service

**Files:**
- Create: `src/lib/status/pane-recovery-service.ts`
- Test: `tests/unit/lib/status-pane-recovery-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover pending input recovery, interrupted prompt recovery, non-Codex rejection, invalid state rejection, capture failure, and no-options rejection.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-pane-recovery-service.test.ts`
Expected: FAIL because `@/lib/status/pane-recovery-service` does not exist.

- [ ] **Step 3: Implement service and connect manager**

Move capture, provider gating, prompt parsing, interrupted prompt detection, event sequencing, and recovery apply options into a dependency-injected service. Keep actual tab mutation, layout persistence, state reducer invocation, and broadcast in `StatusManager`.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm test tests/unit/lib/status-pane-recovery-service.test.ts`
Expected: PASS.

### Task 3: Session History Persistence Adapter

**Files:**
- Create: `src/lib/status/session-history-persistence.ts`
- Test: `tests/unit/lib/status-session-history-persistence.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover runtime default add success, runtime add fallback, direct legacy add, runtime dismissedAt update success, runtime dismissedAt fallback, and direct legacy update.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-session-history-persistence.test.ts`
Expected: FAIL because `@/lib/status/session-history-persistence` does not exist.

- [ ] **Step 3: Implement adapter and connect manager**

Move runtime-v2 session history add/update calls, counter names, warning text, and legacy fallback into the adapter. Keep history entry construction and broadcast in `StatusManager`.

- [ ] **Step 4: Run GREEN**

Run: `corepack pnpm test tests/unit/lib/status-session-history-persistence.test.ts`
Expected: PASS.

### Task 4: Docs And Regression

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Document the three new service boundaries and adjust follow-up backlog wording.

- [ ] **Step 2: Verify**

Run:

```bash
corepack pnpm test tests/unit/lib/status-poll-service.test.ts tests/unit/lib/status-pane-recovery-service.test.ts tests/unit/lib/status-session-history-persistence.test.ts tests/unit/lib/status-session-history-entry.test.ts tests/unit/lib/status-web-push-delivery.test.ts tests/unit/lib/status-web-push-payload.test.ts tests/unit/lib/runtime/status-worker-service.test.ts tests/unit/lib/status-side-effect-policy.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Expected: every command exits 0.
