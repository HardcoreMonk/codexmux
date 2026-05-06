# Session Relationship UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show provider-neutral fork/sub-agent relationship metadata as read-only session list and timeline detail UI.

**Architecture:** Add a pure relationship display helper and reuse it from dense UI components. Extend timeline init with an optional `relationship` field sourced from session index metadata when available. Keep all relationship behavior read-only and non-durable.

**Tech Stack:** TypeScript, React server-render smoke tests, next-intl messages, existing timeline/session types.

---

### Task 1: Display Helper And Tests

**Files:**
- Create: `src/lib/session-relationship-display.ts`
- Create: `tests/unit/lib/session-relationship-display.test.ts`

- [x] **Step 1: Write failing helper tests**

Assert no display for root/missing relationship, display metadata for `sub-agent`, `fork`, and `unknown`, and short target id formatting.

- [x] **Step 2: Run RED**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/session-relationship-display.test.ts
```

Expected: FAIL because helper module does not exist.

- [x] **Step 3: Implement helper**

Create `selectSessionRelationshipDisplay()` and `shortenRelationshipSessionId()` with no raw path/command/prompt inputs.

- [x] **Step 4: Run GREEN**

Run the same focused test and expect PASS.

### Task 2: Timeline Init Relationship

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/lib/timeline/init-message.ts`
- Modify: `src/lib/timeline-server.ts`
- Modify: `src/lib/runtime/timeline/worker-service.ts`
- Modify: `src/hooks/use-timeline-websocket.ts`
- Modify: `src/hooks/use-timeline.ts`
- Test: `tests/unit/lib/timeline-init-message.test.ts`

- [x] **Step 1: Write failing init test**

Extend the init helper test to pass a relationship and expect it on the returned message.

- [x] **Step 2: Run RED**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/timeline-init-message.test.ts
```

Expected: FAIL because relationship is not included.

- [x] **Step 3: Add optional relationship field**

Extend `ITimelineInitMessage`, helper options, WebSocket callback, and `useTimeline()` return state.

- [x] **Step 4: Source relationship from session index**

Use session index metadata for matching JSONL path when building timeline init messages. Do not parse or expose cwd/path/command to UI.

- [x] **Step 5: Run GREEN**

Run timeline init and relationship helper focused tests.

### Task 3: UI Components And Docs

**Files:**
- Modify: `src/components/features/workspace/session-list-item.tsx`
- Modify: `src/components/features/workspace/session-meta-bar.tsx`
- Modify: `src/components/features/workspace/session-meta-content.tsx`
- Modify: `src/components/features/workspace/agent-panel.tsx`
- Modify: `messages/ko/session.json`
- Modify: `messages/en/session.json`
- Create: `tests/unit/components/session-relationship-ui.test.ts`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-07-session-relationship-ui-handoff.md`

- [x] **Step 1: Write failing component smoke test**

Use `renderToStaticMarkup()` with `NextIntlClientProvider` to assert session list badge and meta relation row.

- [x] **Step 2: Run RED**

Run:

```bash
corepack pnpm vitest run tests/unit/components/session-relationship-ui.test.ts
```

Expected: FAIL because UI does not render relationship text.

- [x] **Step 3: Implement read-only UI**

Add localized compact badges to session rows and relation row to meta detail. Use lucide icons and stable dimensions.

- [x] **Step 4: Update docs**

Record that fork/sub-agent UI is read-only and relationship projection remains non-durable.

- [x] **Step 5: Run verification**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/session-relationship-display.test.ts tests/unit/lib/timeline-init-message.test.ts tests/unit/components/session-relationship-ui.test.ts
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm test
```

Expected: all pass.

- [x] **Step 6: Commit when explicitly requested**

Do not commit automatically. Stage and commit only after the user asks for commit/push.
