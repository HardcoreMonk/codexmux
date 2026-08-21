# Status Client Payload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move status sync/update/remove client message projection out of `StatusManager`.

**Architecture:** `status/client-payload.ts` converts internal `ITabStatusEntry` values into the existing public client payload shapes. `StatusManager` continues to own broadcast transport, bridge forwarding, and WebSocket backpressure.

**Tech Stack:** TypeScript, Vitest, existing status types.

---

### Task 1: Client Payload Helper

**Files:**
- Create: `src/lib/status/client-payload.ts`
- Test: `tests/unit/lib/status-client-payload.test.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Write failing tests**

Cover sync entry projection excluding private fields, update message projection including compacting state, and remove message shape.

- [ ] **Step 2: Run RED**

Run: `corepack pnpm test tests/unit/lib/status-client-payload.test.ts`
Expected: FAIL because `@/lib/status/client-payload` does not exist.

- [ ] **Step 3: Implement helper**

Create `toStatusClientTabEntry()`, `buildStatusUpdateMessage()`, and `buildStatusRemoveMessage()`.

- [ ] **Step 4: Connect StatusManager**

Use the helper in `getAllForClient()`, `broadcastUpdate()`, and `broadcastRemove()`.

- [ ] **Step 5: Verify**

Run focused status tests, `tsc`, lint, and full test suite.
