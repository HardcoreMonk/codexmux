# Status Web Push Payload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start the next status module split by extracting Web Push payload/copy construction from `status-manager.ts`.

**Architecture:** `StatusManager` keeps push dispatch orchestration and runtime-v2 fallback behavior. `src/lib/status/web-push-payload.ts` owns pure title/body/silent/workspace/approval metadata payload construction so later Web Push side-effect adapter work can move out cleanly.

**Tech Stack:** TypeScript, Vitest, existing `ITabStatusEntry`, existing approval metadata helpers, existing runtime Web Push payload type.

---

## File Structure

- Create: `src/lib/status/web-push-payload.ts`
  Pure builder for review and needs-input Web Push payloads.
- Create: `tests/unit/lib/status-web-push-payload.test.ts`
  Unit tests for review payload, needs-input approval payload, fallback copy, silent flag.
- Modify: `src/lib/status-manager.ts`
  Replace inline payload construction in `sendWebPush()` with the helper.
- Modify: `docs/STATUS.md`
  Document the Web Push payload helper in status ownership.
- Modify: `docs/FOLLOW-UP.md`
  Mark the first Web Push side-effect boundary helper as complete.

## Task 1: Add Payload Builder Tests

**Files:**
- Create: `tests/unit/lib/status-web-push-payload.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests for:

```typescript
it('builds task-complete review payload with fallback body and silent flag', () => {
  // lastUserMessage is clipped to 100 chars, title is Task Complete, sound off sets silent true.
});

it('builds needs-input payload with approval metadata detail', () => {
  // command approval metadata produces Input Required body, approvalKind, promptType, riskLevel, approvalDetail.
});

it('falls back to tab name then tab id when last user message is absent', () => {
  // review payload body chooses tabName, then tabId.
});
```

- [ ] **Step 2: Run RED**

```bash
corepack pnpm test tests/unit/lib/status-web-push-payload.test.ts
```

Expected: FAIL because `@/lib/status/web-push-payload` does not exist yet.

## Task 2: Implement Payload Builder

**Files:**
- Create: `src/lib/status/web-push-payload.ts`
- Modify: `src/lib/status-manager.ts`

- [ ] **Step 1: Add helper implementation**

Create `buildStatusWebPushPayload(input)` returning existing `IStatusWebPushPayload`.

Inputs:
- `tabId`
- `entry`
- `pushType: 'review' | 'needs-input'`
- `workspaceName`
- `workspaceDir`
- `soundOnCompleteEnabled`

Behavior must match the current inline implementation.

- [ ] **Step 2: Wire `status-manager.ts`**

In `sendWebPush`, keep `getWorkspaces()` and `getConfig()` calls, then call the helper. Remove direct approval copy construction from `status-manager.ts`.

- [ ] **Step 3: Run GREEN**

```bash
corepack pnpm test tests/unit/lib/status-web-push-payload.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Mention `src/lib/status/web-push-payload.ts` as the pure payload/copy boundary for Web Push.

- [ ] **Step 2: Run regression**

```bash
corepack pnpm test tests/unit/lib/status-web-push-payload.test.ts tests/unit/lib/status-side-effect-policy.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: advances status module split toward Web Push/history side-effect adapter extraction.
- Placeholder scan: no deferred implementation remains.
- Type consistency: helper returns existing runtime `IStatusWebPushPayload`.
