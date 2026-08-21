# Timeline Resume Session Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split timeline resume and session-changed helpers out of `timeline-server.ts`.

**Architecture:** `src/lib/timeline/resume-session-service.ts` owns active/stored/latest JSONL resolution, unsafe resume guard, resume command delivery, resume result messages, and session-changed message emission. `timeline-server.ts` keeps WebSocket lifecycle, initial flow branching, and session watcher orchestration.

**Tech Stack:** TypeScript, Vitest, existing provider contract, existing tmux/layout/path validation helpers injected as dependencies.

---

## File Structure

- Create: `src/lib/timeline/resume-session-service.ts`
  Factory for JSONL resolution, resume command handling, and session-changed delivery.
- Create: `tests/unit/lib/timeline-resume-session-service.test.ts`
  Unit tests for interrupted latest fallback, unsafe resume blocking, successful resume command delivery, and session-changed send.
- Modify: `src/lib/timeline-server.ts`
  Use service methods instead of local resolution/resume functions.
- Modify: `docs/ARCHITECTURE-LOGIC.md`
  Add resume/session service to timeline module boundaries.
- Modify: `docs/FOLLOW-UP.md`
  Mark resume/session-changed service split complete.

## Task 1: Add Resume Session Service Tests

**Files:**
- Create: `tests/unit/lib/timeline-resume-session-service.test.ts`

- [ ] **Step 1: Write failing tests**

Create tests that import `createTimelineResumeSessionService` from `@/lib/timeline/resume-session-service` and verify:

```typescript
it('prefers the latest cwd JSONL only when the active Codex JSONL is interrupted', async () => {
  // provider.resolveLatestJsonlPath returns a newer JSONL, checkJsonlState returns interrupted true, result uses latest.
});

it('blocks resume when the terminal process is unsafe', async () => {
  // checkTerminalProcess returns isSafe false; assert resume-blocked message and sendKeys not called.
});

it('sends resume command and resume-started when the terminal is safe', async () => {
  // buildResumeCommand, sendKeys, updateTabAgentSessionId, resolveJsonlPath, and resume-started message all run.
});

it('emits session-changed through the injected delivery sender', () => {
  // assert exact timeline:session-changed payload.
});
```

- [ ] **Step 2: Run RED**

```bash
corepack pnpm test tests/unit/lib/timeline-resume-session-service.test.ts
```

Expected: FAIL because `@/lib/timeline/resume-session-service` does not exist yet.

## Task 2: Implement Resume Session Service

**Files:**
- Create: `src/lib/timeline/resume-session-service.ts`
- Modify: `src/lib/timeline-server.ts`

- [ ] **Step 1: Add implementation**

Create `createTimelineResumeSessionService(deps)` with:

- `resolveJsonlPath(provider, tmuxSession, sessionId)`
- `resolveLatestCwdJsonl(provider, sessionName, currentJsonlPath)`
- `resolveActiveOrLatestJsonl(provider, sessionName, activeJsonlPath, activeSessionId)`
- `resolveStoredOrLatestJsonl(provider, sessionName, sessionId)`
- `resolveResumeMessage(ws, conn, payload)`
- `sendSessionChanged(ws, newSessionId, reason)`

The implementation preserves current behavior: cwd lookup before provider path resolution, allowed/existing cached path guard, latest cwd JSONL only when newer than current and active Codex state is interrupted, unsafe process resume block, `buildResumeCommand`, `sendKeys`, best-effort tab session id write, and resume-started/resume-error messages.

- [ ] **Step 2: Wire from `timeline-server.ts`**

Instantiate once with existing helpers:

```typescript
const timelineResumeSessionService = createTimelineResumeSessionService({
  send: timelineDelivery.send,
  checkTerminalProcess,
  sendKeys,
  parseSessionName,
  updateTabAgentSessionId: async (sessionName, provider, sessionId) => {
    await updateTabAgentSessionId(sessionName, provider, sessionId).catch(() => {});
  },
  readTabAgentJsonlPath,
  getSessionCwd,
  isAllowedJsonlPath,
  existsPath: existsSync,
  statFileMtimeMs: async (filePath) => (await fsStat(filePath)).mtimeMs,
  checkJsonlState: checkCodexJsonlState,
  extractSessionIdFromJsonlPath,
});
```

Replace local helpers and session-changed sends with service methods.

- [ ] **Step 3: Run GREEN**

```bash
corepack pnpm test tests/unit/lib/timeline-resume-session-service.test.ts
```

Expected: PASS.

## Task 3: Docs And Regression

**Files:**
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Update docs**

Update timeline module boundaries and follow-up notes to include `src/lib/timeline/resume-session-service.ts`.

- [ ] **Step 2: Run regression**

```bash
corepack pnpm test tests/unit/lib/timeline-resume-session-service.test.ts tests/unit/lib/timeline-subscription-delivery.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

## Self-Review

- Spec coverage: completes the remaining timeline split candidate while preserving resume/session-changed behavior.
- Placeholder scan: no deferred implementation remains.
- Type consistency: service uses existing `IAgentProvider`, `IAgentJsonlResolution`, `ITimelineConnection` subset, and `TTimelineServerMessage` shapes.
