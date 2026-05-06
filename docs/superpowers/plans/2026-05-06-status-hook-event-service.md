# Status Hook Event Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move hook event classification and transition intent construction out of `StatusManager`.

**Architecture:** `StatusHookEventService` evaluates raw hook events into compact, ignored, or processed intents. `StatusManager` remains responsible for tab lookup, mutation, layout persistence, JSONL recheck/refresh, and broadcast side effects.

**Tech Stack:** TypeScript, Vitest, existing `reduceHookState()` and `shouldProcessHookEvent()` helpers.

---

### Task 1: Hook Event Service

**Files:**
- Create: `src/lib/status/hook-event-service.ts`
- Test: `tests/unit/lib/status-hook-event-service.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover compact hooks, unknown hooks, non-input notifications, prompt-submit transition, Codex stop defer, and non-Codex stop JSONL refresh intent.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-hook-event-service.test.ts`
Expected: FAIL because `@/lib/status/hook-event-service` does not exist.

- [ ] **Step 3: Implement service**

Create `evaluateStatusHookEvent()` that accepts raw event, notification type, entry state, provider id, and time source, then returns a typed intent.

- [ ] **Step 4: Connect StatusManager**

Replace inline hook event parsing, notification filtering, sequence creation, and reducer invocation with the new service while preserving side effects.

- [ ] **Step 5: Verify**

Run focused hook/status tests, `tsc`, lint, and full test suite.
