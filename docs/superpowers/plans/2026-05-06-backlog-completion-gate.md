# Backlog Completion Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `corepack pnpm ops:backlog:completion-gate` so the full backlog can only close at 100% when every row has command success, manual evidence, spec linkage, or approved defer evidence.

**Architecture:** The gate is a read-only Node script. A focused helper library consumes `ops-backlog-batch-plan-lib.mjs`, command-run artifacts, and an optional manifest, then returns a sanitized closability decision. The CLI writes an `ops-backlog-completion-gate` smoke artifact and exits non-zero when the backlog is not fully closed.

**Tech Stack:** Node ESM scripts, pnpm package scripts, Vitest unit tests, existing smoke artifact helper.

---

### Task 1: Completion Gate Helper

**Files:**
- Create: `scripts/ops-backlog-completion-gate-lib.mjs`
- Test: `tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/ops-backlog-completion-gate-lib.mjs')).href);

describe('ops backlog completion gate helpers', () => {
  it('rejects skipped backlog rows as incomplete', async () => {
    const { buildBacklogCompletionGate } = await loadLib();
    const gate = buildBacklogCompletionGate({
      batchRunArtifacts: [{
        payload: {
          results: [{ command: 'corepack pnpm smoke:permission', status: 'passed' }],
          planned: { skipped: [{ slug: 'ipad-pwa-long-background' }] },
        },
      }],
      manifest: { entries: [] },
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(gate.closable).toBe(false);
    expect(gate.completionPercent).toBeLessThan(100);
    expect(gate.notClosableReasons).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: 'ipad-pwa-long-background', reason: 'missing-terminal-state' }),
    ]));
  });

  it('closes to 100 percent with passed command evidence and manifest entries', async () => {
    const { buildBacklogCompletionGate, buildFixtureCompletionManifest } = await loadLib();
    const manifest = buildFixtureCompletionManifest({
      state: 'approved-deferred',
      owner: 'ops',
      reference: 'docs/operations/completion-fixture.md',
      recordedAt: '2026-05-06T00:00:00.000Z',
      reason: 'operator-approved defer with revisit trigger',
    });
    const gate = buildBacklogCompletionGate({
      batchRunArtifacts: [{
        payload: {
          results: manifest.automatedCommands.map((command: string) => ({ command, status: 'passed' })),
        },
      }],
      manifest,
      generatedAt: '2026-05-06T00:00:00.000Z',
    });

    expect(gate.closable).toBe(true);
    expect(gate.completionPercent).toBe(100);
    expect(gate.notClosableReasons).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `corepack pnpm test tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`
Expected: FAIL because `scripts/ops-backlog-completion-gate-lib.mjs` does not exist.

- [ ] **Step 3: Implement the helper**

```js
import { flattenBacklogBatches } from './ops-backlog-batch-plan-lib.mjs';

export const TERMINAL_STATES = Object.freeze([
  'passed',
  'evidence-attached',
  'spec-linked',
  'approved-deferred',
]);

export const normalizeCompletionManifest = (manifest = {}) => ({
  schemaVersion: manifest.schemaVersion ?? 1,
  entries: Array.isArray(manifest.entries) ? manifest.entries : [],
});

export const buildBacklogCompletionGate = ({ batchRunArtifacts = [], manifest = {}, generatedAt = new Date().toISOString() } = {}) => {
  const items = flattenBacklogBatches();
  const normalizedManifest = normalizeCompletionManifest(manifest);
  const commandResults = new Map();
  for (const artifact of batchRunArtifacts) {
    for (const result of artifact?.payload?.results ?? []) {
      if (result?.command && result.status === 'passed') commandResults.set(result.command, result);
    }
  }

  const entriesBySlug = new Map(normalizedManifest.entries.map((entry) => [entry.slug, entry]));
  const rows = items.map((item) => {
    const passedByCommand = item.commands?.length > 0 && item.commands.every((command) => commandResults.has(command));
    const manifestEntry = entriesBySlug.get(item.slug);
    const manifestState = TERMINAL_STATES.includes(manifestEntry?.state) ? manifestEntry.state : null;
    const state = passedByCommand ? 'passed' : manifestState;
    return { slug: item.slug, title: item.title, execution: item.execution, state: state ?? 'incomplete' };
  });

  const notClosableReasons = rows
    .filter((row) => !TERMINAL_STATES.includes(row.state))
    .map((row) => ({ slug: row.slug, reason: 'missing-terminal-state' }));

  return {
    schemaVersion: 1,
    generatedAt,
    rowCount: rows.length,
    completionPercent: Math.round(((rows.length - notClosableReasons.length) / rows.length) * 100),
    closable: notClosableReasons.length === 0,
    notClosableReasons,
    rows,
  };
};
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `corepack pnpm test tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`
Expected: PASS.

### Task 2: Completion Gate CLI

**Files:**
- Create: `scripts/ops-backlog-completion-gate.mjs`
- Modify: `package.json`
- Test: `tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`

- [ ] **Step 1: Extend tests for manifest validation and artifact discovery**

```ts
it('validates manifest entries before accepting them', async () => {
  const { validateCompletionManifest } = await loadLib();
  expect(validateCompletionManifest({ entries: [{ slug: 'ipad-pwa-long-background', state: 'evidence-attached' }] }))
    .toMatchObject({ ok: false, failures: expect.arrayContaining(['entry-owner-missing:ipad-pwa-long-background']) });
});
```

- [ ] **Step 2: Implement CLI and package script**

```js
#!/usr/bin/env node
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
import { buildBacklogCompletionGate, readCompletionEvidence } from './ops-backlog-completion-gate-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-backlog-completion-${Date.now()}`);
const manifestPath = process.env.CODEXMUX_BACKLOG_COMPLETION_MANIFEST || '';

const main = async () => {
  const evidence = await readCompletionEvidence({ artifactRoot, manifestPath });
  const payload = buildBacklogCompletionGate({ ...evidence, generatedAt: startedAt });
  await writeSmokeArtifact({
    smokeName: 'ops-backlog-completion-gate',
    status: payload.closable ? 'passed' : 'failed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });
  console.log(JSON.stringify(payload, null, 2));
  process.exit(payload.closable ? 0 : 1);
};

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, code: 'ops-backlog-completion-gate-failed', message: err.message }, null, 2));
  process.exit(1);
});
```

- [ ] **Step 3: Run syntax and focused tests**

Run: `node --check scripts/ops-backlog-completion-gate.mjs`
Expected: PASS.

Run: `corepack pnpm test tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts`
Expected: PASS.

### Task 3: Docs And Handoff

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-06-backlog-completion-gate-handoff.md`

- [ ] **Step 1: Update docs**

Add the completion gate command after the existing backlog runner docs:

```md
CODEXMUX_BACKLOG_COMPLETION_MANIFEST=docs/operations/<manifest>.json \
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-completion \
corepack pnpm ops:backlog:completion-gate
```

Explain that skipped rows are incomplete until evidence, spec links, or approved defer entries close
them.

- [ ] **Step 2: Add operation handoff**

Record implementation files, verification commands, and the read-only safety boundary.

### Task 4: Verification

**Files:**
- All changed files

- [ ] **Step 1: Run focused verification**

Run:

```bash
corepack pnpm test tests/unit/scripts/ops-backlog-completion-gate-lib.test.ts
node --check scripts/ops-backlog-completion-gate-lib.mjs
node --check scripts/ops-backlog-completion-gate.mjs
```

Expected: all pass.

- [ ] **Step 2: Run incomplete gate smoke**

Run:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-backlog-completion-incomplete \
CODEXMUX_BACKLOG_COMPLETION_DRY_RUN=1 \
corepack pnpm ops:backlog:completion-gate
```

Expected: exit 1 with `closable: false` and `notClosableReasons`.

- [ ] **Step 3: Run full project verification**

Run:

```bash
corepack pnpm test
corepack pnpm lint
corepack pnpm tsc --noEmit
git diff --check
```

Expected: all pass.
