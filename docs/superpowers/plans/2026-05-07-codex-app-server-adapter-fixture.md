# Codex App-Server Adapter Fixture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a disabled-by-default Codex app-server fixture adapter boundary without changing production provider ownership.

**Architecture:** Keep the existing Codex JSONL/tmux provider as the only registered runtime provider. Add a separate `codex-app-server` read-only fixture adapter with env-gated capability reporting and sanitized normalization for session, timeline, and status hint events.

**Tech Stack:** TypeScript, Vitest, existing timeline/status/provider types.

---

### Task 1: Fixture Adapter Tests

**Files:**
- Create: `tests/fixtures/providers/codex-app-server/session-events.json`
- Create: `tests/unit/lib/codex-app-server-adapter.test.ts`

- [x] **Step 1: Add fixture JSON**

Create a fixture with one session event, two message events, and one status event. Include raw fields such as `cwd`, `command`, `rawPayload`, and `token` so tests can prove the adapter does not leak them.

- [x] **Step 2: Write failing tests**

Cover disabled default, experimental capability, provider registry isolation, and sanitized fixture normalization.

- [x] **Step 3: Run RED**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/codex-app-server-adapter.test.ts
```

Expected: FAIL because `@/lib/providers/codex-app-server` does not exist yet.

### Task 2: Disabled Read-Only Adapter

**Files:**
- Create: `src/lib/providers/codex-app-server/index.ts`

- [x] **Step 1: Implement capability gate**

Add `resolveCodexAppServerMode()` and `buildCodexAppServerCapability()`. Default mode is `disabled`; only exact `experimental` enables read-only health/session/timeline/status capabilities. Execution capabilities remain false.

- [x] **Step 2: Implement fixture normalization**

Add `parseCodexAppServerFixture()` with sanitized session id handling, relationship projection via `buildAgentSessionRelationship()`, timeline user/assistant mapping, and status hint mapping. Ignore unknown events and raw payload fields.

- [x] **Step 3: Run GREEN**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/codex-app-server-adapter.test.ts tests/unit/lib/providers.test.ts
```

Expected: PASS.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-07-codex-app-server-adapter-fixture-handoff.md`

- [x] **Step 1: Update architecture docs**

Document that the app-server adapter exists only as a disabled fixture boundary and is not a registered provider.

- [x] **Step 2: Update status docs**

Document that app-server status hints are not status source-of-truth and cannot execute approvals.

- [x] **Step 3: Add handoff**

Record the scope, rollback, and verification commands.

- [x] **Step 4: Run final verification**

Run:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Expected: all pass.

- [x] **Step 5: Commit when explicitly requested**

Do not commit automatically. Stage and commit only after the user asks for commit/push.
