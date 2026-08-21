# Backlog 100% Completion Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the backlog completion batch so the latest full work list can close at 100% with passed automated evidence plus explicit spec/defer terminal states.

**Architecture:** Keep the existing planner/runner/manifest/gate pipeline. Add the latest CODEX panel timeline hotfix regression as an automated row, refresh manifest references/reasons to current handoffs/specs, and update tests/docs so the gate remains strict.

**Tech Stack:** Node ESM scripts, Vitest unit tests, pnpm scripts, Markdown operations docs.

---

### Task 1: Planner Coverage Refresh

**Files:**
- Modify: `scripts/ops-backlog-batch-plan-lib.mjs`
- Modify: `tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts`

- [ ] **Step 1: Add failing test coverage**

Add an assertion that the release lane includes a new automated row:

```ts
expect(plan.summary).toMatchObject({
  batchCount: 8,
  automatedCount: 17,
  conditionalCount: 4,
  manualRequiredCount: 11,
  specRequiredCount: 9,
});
expect(plan.batches.find((batch: { id: string }) => batch.id === 'release-ops').items)
  .toEqual(expect.arrayContaining([
    expect.objectContaining({
      slug: 'codex-panel-timeline-hotfix-regression',
      execution: 'automated',
    }),
  ]));
```

- [ ] **Step 2: Run failing planner test**

Run:

```bash
corepack pnpm test tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts
```

Expected before implementation: summary count or missing slug assertion fails.

- [ ] **Step 3: Add planner row**

Add this item in the `release-ops` lane:

```js
item({
  slug: 'codex-panel-timeline-hotfix-regression',
  title: 'CODEX panel timeline hotfix regression',
  execution: 'automated',
  priority: 'p1',
  rationale: 'Focused tests protect panel metadata preservation and duplicate same-JSONL session-changed suppression.',
  commands: [command('corepack pnpm test tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/hooks/use-layout-panel-type.test.ts tests/unit/hooks/use-tab-store.test.ts tests/unit/lib/session-list-rendering.test.ts')],
  covers: ['codex-panel-switch-timeline', 'timeline-duplicate-session-changed'],
});
```

Add both coverage tags to `REQUIRED_COVERAGE`.

- [ ] **Step 4: Run planner test**

Run:

```bash
corepack pnpm test tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts
```

Expected: pass.

### Task 2: Completion Manifest And Gate Counts

**Files:**
- Modify: `scripts/ops-backlog-completion-manifest-lib.mjs`
- Modify: `tests/unit/scripts/ops-backlog-completion-manifest-lib.test.ts`
- Modify: `tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`

- [ ] **Step 1: Update expected terminal counts**

The new row is automated, so valid closeout state counts become:

```ts
expect(gate.summary.byState).toMatchObject({
  passed: 18,
  'evidence-attached': 2,
  'spec-linked': 9,
  'approved-deferred': 12,
});
```

Fixture manifest test should expect:

```ts
expect(gate.summary.byState).toMatchObject({
  passed: 18,
  'approved-deferred': 23,
});
```

- [ ] **Step 2: Update stale references**

Change release evidence reference from the old `v0.4.6` handoff to the latest relevant handoff:

```js
const RELEASE_HANDOFF = 'docs/operations/2026-05-06-release-v0.4.7-conditional-batch-handoff.md';
```

- [ ] **Step 3: Run completion tests**

Run:

```bash
corepack pnpm test tests/unit/scripts/ops-backlog-completion-manifest-lib.test.ts tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts
```

Expected: pass.

### Task 3: Docs And Handoff

**Files:**
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-07-backlog-100-completion-batch-handoff.md`

- [ ] **Step 1: Update docs command**

Document:

```bash
CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete \
corepack pnpm ops:backlog:complete
```

- [ ] **Step 2: Add handoff**

Record scope, command, expected row state summary, and strict defer policy.

- [ ] **Step 3: Run markdown sanity**

Run:

```bash
git diff --check
```

Expected: no output.

### Task 4: Final Verification

**Files:**
- All changed files

- [ ] **Step 1: Syntax check changed scripts**

Run:

```bash
node --check scripts/ops-backlog-batch-plan-lib.mjs
node --check scripts/ops-backlog-completion-manifest-lib.mjs
node --check scripts/ops-backlog-completion-gate-lib.mjs
```

Expected: no output.

- [ ] **Step 2: Run focused tests**

Run:

```bash
corepack pnpm test tests/unit/scripts/ops-backlog-batch-plan-lib.test.ts tests/unit/scripts/ops-backlog-completion-manifest-lib.test.ts tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts
```

Expected: pass.

- [ ] **Step 3: Run closeout dry command**

Run:

```bash
CODEXMUX_BACKLOG_COMPLETION_ALLOW_DEFER=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete-20260507 \
corepack pnpm ops:backlog:complete
```

Expected: JSON summary with `"ok": true`, and the completion gate artifact reports `completionPercent=100` and `closable=true`.

- [ ] **Step 4: Confirm conservative failure still works**

Run:

```bash
CODEXMUX_BACKLOG_COMPLETE_SKIP_BATCH_RUN=1 \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-complete-20260507-nodefer \
corepack pnpm ops:backlog:complete
```

Expected: non-zero exit because manual/conditional rows remain open without approved defers.
