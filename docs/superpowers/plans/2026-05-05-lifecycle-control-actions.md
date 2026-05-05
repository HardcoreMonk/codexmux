# Lifecycle Control Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add allowlisted lifecycle actions to `/experimental/runtime` with confirmation and sanitized audit history.

**Architecture:** `src/lib/runtime/lifecycle-actions.ts` owns action definitions, execution, concurrency, and audit normalization. `src/pages/api/runtime/lifecycle/action.ts` exposes GET/POST for recent audit and action start. `LifecycleControlPanel` renders executable action controls without accepting arbitrary command text.

**Tech Stack:** Next.js Pages API routes, TypeScript, Node `child_process.execFile`, JSONL under `~/.codexmux/`, Vitest, React SSR component tests.

---

### Task 1: Lifecycle Action Core

**Files:**
- Create: `src/lib/runtime/lifecycle-actions.ts`
- Test: `tests/unit/lib/runtime-lifecycle-actions.test.ts`

- [x] Write failing tests for allowed action ids, confirmation phrases, concurrency, and sanitized audit output.
- [x] Implement action definitions for `phase6-gate`, `restart-service`, and `deploy-local`.
- [x] Persist audit records to `~/.codexmux/lifecycle-actions.jsonl`.

### Task 2: Lifecycle Action API

**Files:**
- Create: `src/pages/api/runtime/lifecycle/action.ts`
- Test: `tests/unit/pages/runtime-lifecycle-action-api.test.ts`

- [x] Write failing tests for GET recent audit, POST action allowlist, invalid action rejection, and confirmation rejection.
- [x] Implement the API with no shell command input.

### Task 3: Lifecycle Control UI

**Files:**
- Modify: `src/lib/runtime/lifecycle-control.ts`
- Modify: `src/components/features/runtime/lifecycle-control-panel.tsx`
- Modify: `src/pages/experimental/runtime.tsx`
- Modify: `messages/ko/runtime.json`
- Modify: `messages/en/runtime.json`
- Test: `tests/unit/components/lifecycle-control-panel.test.ts`

- [x] Extend the view model with action metadata and latest audit rows.
- [x] Render action buttons and exact confirmation inputs for guarded actions.
- [x] Wire POST calls from `/experimental/runtime` and refresh evidence after completion.

### Task 4: Docs And Verification

**Files:**
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/SYSTEMD.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/FOLLOW-UP.md`

- [x] Document `lifecycle-actions.jsonl`, allowlist, confirmation, and non-goals.
- [x] Run focused tests, typecheck, lint, build, and `git diff --check`.
