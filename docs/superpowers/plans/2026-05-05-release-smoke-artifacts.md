# Release Smoke Artifacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Preserve Browser/Electron/Android reconnect smoke results as sanitized JSON artifacts for release evidence.

**Architecture:** Add one script-local artifact helper and call it from existing smoke script success/failure exits. Keep stdout payloads compatible and make file writing opt-in through `CODEXMUX_SMOKE_ARTIFACT_DIR`. The release workflow automatically uploads browser reconnect smoke artifacts; Android and packaged Electron evidence use the same helper from manual or self-hosted runs.

**Tech Stack:** Node `.mjs` scripts, Vitest, GitHub Actions, pnpm, Playwright Chromium, existing Android/Electron smoke helpers.

---

## File Structure

- Create: `scripts/smoke-artifact-lib.mjs`
  - Sanitizes smoke payloads.
  - Writes opt-in artifact JSON files.
  - Does nothing when `CODEXMUX_SMOKE_ARTIFACT_DIR` is unset.
- Create: `tests/unit/scripts/smoke-artifact-lib.test.ts`
  - Verifies opt-in behavior, filename shape, success/failure payloads, and redaction.
- Modify: `scripts/smoke-browser-reconnect-dom.mjs`
  - Write `browser-reconnect` pass/fail artifact.
- Modify: `scripts/smoke-electron-runtime-v2.mjs`
  - Write `electron-runtime-v2` pass/fail artifact.
- Modify: `scripts/smoke-android-foreground-reconnect.mjs`
  - Write `android-foreground` pass/fail artifact.
- Modify: `scripts/smoke-android-runtime-v2-foreground.mjs`
  - Write `android-runtime-v2` pass/fail artifact.
- Modify: `scripts/smoke-android-timeline-foreground.mjs`
  - Write `android-timeline-foreground` pass/fail artifact.
- Modify: `.github/workflows/release.yml`
  - Add browser reconnect smoke artifact job.
  - Make `github-release` wait for that job.
- Modify: `docs/TESTING.md`
  - Document artifact env var and manual commands.
- Modify: `docs/FOLLOW-UP.md`
  - Move release smoke artifact foundation out of remaining P2 work.
- Create: `docs/operations/2026-05-05-release-smoke-artifacts-handoff.md`
  - Record rollout evidence and CI/manual split.

## Tasks

### Task 1: Add Smoke Artifact Helper

**Files:**
- Create: `scripts/smoke-artifact-lib.mjs`
- Create: `tests/unit/scripts/smoke-artifact-lib.test.ts`

- [x] **Step 1: Write failing tests**

Create `tests/unit/scripts/smoke-artifact-lib.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/smoke-artifact-lib.mjs')).href);

describe('smoke artifact helpers', () => {
  it('does not write when CODEXMUX_SMOKE_ARTIFACT_DIR is unset', async () => {
    const { writeSmokeArtifact } = await loadLib();
    const result = await writeSmokeArtifact({
      smokeName: 'browser-reconnect',
      status: 'passed',
      startedAt: '2026-05-05T00:00:00.000Z',
      payload: { ok: true },
      env: {},
    });

    expect(result).toEqual({ skipped: true, path: null });
  });

  it('writes a sanitized artifact when artifact dir is set', async () => {
    const { writeSmokeArtifact } = await loadLib();
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-smoke-artifact-test-'));

    const result = await writeSmokeArtifact({
      smokeName: 'android-timeline-foreground',
      status: 'failed',
      startedAt: '2026-05-05T00:00:00.000Z',
      endedAt: '2026-05-05T00:00:03.000Z',
      payload: {
        ok: false,
        code: 'android-failed',
        homeDir: '/tmp/codexmux-android-timeline-foreground-secret',
        serverOutput: 'prompt body should not survive',
        checks: ['android-bridge'],
        nested: {
          jsonlPath: '/home/me/.codex/sessions/2026/05/05/secret.jsonl',
          message: 'secret-android-timeline-user-1',
        },
      },
      env: { CODEXMUX_SMOKE_ARTIFACT_DIR: dir },
    });

    expect(result.skipped).toBe(false);
    expect(result.path).toMatch(/android-timeline-foreground-20260505T000003000Z-failed\.json$/);

    const artifact = JSON.parse(await fs.readFile(result.path, 'utf-8'));
    expect(artifact).toMatchObject({
      schemaVersion: 1,
      smokeName: 'android-timeline-foreground',
      status: 'failed',
      durationMs: 3000,
      payload: {
        ok: false,
        code: 'android-failed',
        checks: ['android-bridge'],
        nested: {
          jsonlPath: '[codex-session-path]',
          message: '[content]',
        },
      },
    });
    expect(JSON.stringify(artifact)).not.toContain('prompt body');
    expect(JSON.stringify(artifact)).not.toContain('codexmux-android-timeline-foreground-secret');
    expect(JSON.stringify(artifact)).not.toContain('secret.jsonl');
  });

  it('falls back to the current time when endedAt is omitted', async () => {
    const { buildSmokeArtifactFilename } = await loadLib();

    expect(buildSmokeArtifactFilename({
      smokeName: 'browser-reconnect',
      status: 'passed',
      endedAt: '2026-05-05T01:02:03.456Z',
    })).toBe('browser-reconnect-20260505T010203456Z-passed.json');
  });
});
```

- [x] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts
```

Expected: FAIL because `scripts/smoke-artifact-lib.mjs` does not exist.

- [x] **Step 3: Implement the helper**

Create `scripts/smoke-artifact-lib.mjs`:

```javascript
import fs from 'fs/promises';
import path from 'path';

const droppedKeyPattern = /^(homeDir|serverOutput|output|logcat|cookie|token|password|sessionCookie|raw|stdout|stderr|sessionName|sessionId|workspaceId|tabId|jsonlPath|baseUrl|targetUrl|pageUrl|restoreUrl|devtools|adb|serial|serverPort|remoteDebuggingPort)$/i;
const jsonlPathPattern = /(?:[A-Za-z]:)?[^"'\\n\\r\\t ]*\\.codex[\\/\\\\]sessions[\\/\\\\][^"'\\n\\r\\t ]+/g;
const tempPathPattern = /(?:[A-Za-z]:)?[\\/\\\\]tmp[\\/\\\\]codexmux-[^"'\\n\\r\\t ]+/g;
const smokeSecretPattern = /secret-(android|electron|browser|runtime|timeline|reconnect)-[a-z0-9-]+/gi;

const timestampForFilename = (value) =>
  new Date(value).toISOString().replace(/[-:]/g, '').replace('.', '').replace('Z', 'Z');

export const buildSmokeArtifactFilename = ({ smokeName, status, endedAt = new Date().toISOString() }) =>
  `${smokeName}-${timestampForFilename(endedAt)}-${status}.json`;

const sanitizeString = (value) =>
  value
    .replace(jsonlPathPattern, '[codex-session-path]')
    .replace(tempPathPattern, '[tmp]')
    .replace(smokeSecretPattern, '[content]');

export const sanitizeSmokeArtifactPayload = (value) => {
  if (Array.isArray(value)) return value.map((item) => sanitizeSmokeArtifactPayload(item));
  if (!value || typeof value !== 'object') {
    return typeof value === 'string' ? sanitizeString(value) : value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !droppedKeyPattern.test(key))
      .map(([key, item]) => [key, sanitizeSmokeArtifactPayload(item)]),
  );
};

export const writeSmokeArtifact = async ({
  smokeName,
  status,
  payload,
  startedAt,
  endedAt = new Date().toISOString(),
  env = process.env,
}) => {
  const artifactDir = env.CODEXMUX_SMOKE_ARTIFACT_DIR;
  if (!artifactDir) return { skipped: true, path: null };

  const startMs = Date.parse(startedAt);
  const endMs = Date.parse(endedAt);
  const artifact = {
    schemaVersion: 1,
    smokeName,
    status,
    startedAt,
    endedAt,
    durationMs: Number.isFinite(startMs) && Number.isFinite(endMs) ? Math.max(0, endMs - startMs) : null,
    payload: sanitizeSmokeArtifactPayload(payload),
  };

  await fs.mkdir(artifactDir, { recursive: true });
  const artifactPath = path.join(artifactDir, buildSmokeArtifactFilename({ smokeName, status, endedAt }));
  await fs.writeFile(artifactPath, `${JSON.stringify(artifact, null, 2)}\\n`, 'utf-8');
  return { skipped: false, path: artifactPath };
};
```

- [x] **Step 4: Run focused helper test**

Run:

```bash
corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts
```

Expected: PASS.

### Task 2: Wire Browser And Electron Smoke Artifacts

**Files:**
- Modify: `scripts/smoke-browser-reconnect-dom.mjs`
- Modify: `scripts/smoke-electron-runtime-v2.mjs`

- [x] **Step 1: Update browser smoke imports and failure path**

In `scripts/smoke-browser-reconnect-dom.mjs`, add:

```javascript
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
```

Define:

```javascript
const SMOKE_NAME = 'browser-reconnect';
const startedAt = new Date().toISOString();

const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: SMOKE_NAME,
    status,
    startedAt,
    payload,
  }).catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      code: 'smoke-artifact-write-failed',
      message: err instanceof Error ? err.message : String(err),
    }, null, 2));
  });
```

Change `fail` to:

```javascript
const fail = async (code, message, details = {}) => {
  const payload = { ok: false, code, message, ...details };
  await writeArtifact('failed', payload);
  console.error(JSON.stringify(payload, null, 2));
  process.exit(1);
};
```

Update the existing `catch` call to `await fail(...)`.

- [x] **Step 2: Update browser success path**

Replace the direct `console.log(JSON.stringify({ ... }))` success block with:

```javascript
const payload = {
  ok: true,
  baseUrl,
  workspaceId: workspace.id,
  tabId: tab.id,
  sessionName: tab.sessionName,
  checks: [
    'session-not-found-overlay-visible',
    'floating-reconnect-hidden',
    'restart-new-terminal-clickable',
  ],
  browser,
};
await writeArtifact('passed', payload);
console.log(JSON.stringify(payload, null, 2));
```

- [x] **Step 3: Update Electron smoke**

Apply the same pattern to `scripts/smoke-electron-runtime-v2.mjs` with:

```javascript
const SMOKE_NAME = 'electron-runtime-v2';
const startedAt = new Date().toISOString();
```

The success payload should be the existing Electron success object assigned to `payload`, then:

```javascript
await writeArtifact('passed', payload);
console.log(JSON.stringify(payload, null, 2));
```

The catch block should call `await fail('electron-runtime-v2-smoke-failed', ...)`.

- [x] **Step 4: Syntax check edited scripts**

Run:

```bash
node --check scripts/smoke-browser-reconnect-dom.mjs
node --check scripts/smoke-electron-runtime-v2.mjs
```

Expected: both commands pass with no output.

### Task 3: Wire Android Smoke Artifacts

**Files:**
- Modify: `scripts/smoke-android-foreground-reconnect.mjs`
- Modify: `scripts/smoke-android-runtime-v2-foreground.mjs`
- Modify: `scripts/smoke-android-timeline-foreground.mjs`

- [x] **Step 1: Add helper imports and smoke names**

Add this import to each Android script:

```javascript
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';
```

Use these smoke names:

```javascript
const SMOKE_NAME = 'android-foreground';
const SMOKE_NAME = 'android-runtime-v2';
const SMOKE_NAME = 'android-timeline-foreground';
```

Add one `startedAt` near the beginning of each `main`:

```javascript
const startedAt = new Date().toISOString();
```

- [x] **Step 2: Add local artifact writer**

Add inside each script:

```javascript
const writeArtifact = async (status, payload) =>
  writeSmokeArtifact({
    smokeName: SMOKE_NAME,
    status,
    startedAt,
    payload,
  }).catch((err) => {
    console.error(JSON.stringify({
      ok: false,
      code: 'smoke-artifact-write-failed',
      message: err instanceof Error ? err.message : String(err),
    }, null, 2));
  });
```

- [x] **Step 3: Write artifacts before final success/failure output**

For scripts that use `successPayload` and `failurePayload`, add:

```javascript
if (failurePayload) {
  await writeArtifact('failed', failurePayload);
  exitWithFailure(failurePayload);
}

if (successPayload) {
  await writeArtifact('passed', successPayload);
  console.log(JSON.stringify(successPayload, null, 2));
}
```

If a script exits through a `fail` helper, convert the helper to async using the Browser pattern from Task 2.

- [x] **Step 4: Syntax check edited Android scripts**

Run:

```bash
node --check scripts/smoke-android-foreground-reconnect.mjs
node --check scripts/smoke-android-runtime-v2-foreground.mjs
node --check scripts/smoke-android-timeline-foreground.mjs
```

Expected: all commands pass with no output.

### Task 4: Add Release Workflow Artifact Job

**Files:**
- Modify: `.github/workflows/release.yml`

- [x] **Step 1: Add browser reconnect smoke job**

Add this job after `check`:

```yaml
  browser-reconnect-smoke:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v6

      - uses: pnpm/action-setup@v5

      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm

      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install chromium
      - run: CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:browser-reconnect

      - uses: actions/upload-artifact@v7
        with:
          name: smoke-browser-reconnect
          path: artifacts/smoke/*.json
          if-no-files-found: error
          retention-days: 14
```

- [x] **Step 2: Gate GitHub release on the smoke job**

Change:

```yaml
    needs: [publish-npm, build-electron]
```

to:

```yaml
    needs: [publish-npm, build-electron, browser-reconnect-smoke]
```

- [x] **Step 3: Validate workflow syntax structurally**

Run:

```bash
git diff -- .github/workflows/release.yml
```

Expected: exactly one new job and one `needs` list update. No Android job should be added here.

### Task 5: Update Docs And Handoff

**Files:**
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-05-release-smoke-artifacts-handoff.md`

- [x] **Step 1: Update `docs/TESTING.md`**

Add a subsection near platform smoke guidance:

````markdown
### Smoke Artifact Evidence

Smoke scripts that support release evidence write sanitized JSON when
`CODEXMUX_SMOKE_ARTIFACT_DIR` is set:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:browser-reconnect
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:electron:runtime-v2
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:foreground
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:runtime-v2
CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke corepack pnpm smoke:android:timeline-foreground
```

Artifacts preserve pass/fail state, check names, runtime/app/device metadata, reconnect round
counts, and blocking console/logcat counts. They do not preserve token values, temp HOME paths,
session identifiers, target URLs, server stdout/stderr, prompt body, terminal output, or Codex
JSONL paths.

The release workflow runs `smoke:browser-reconnect` on GitHub-hosted Ubuntu and uploads
`smoke-browser-reconnect`. Android and packaged Electron smoke remain manual or self-hosted
because they require a real device or macOS app bundle context.
````

- [x] **Step 2: Update `docs/FOLLOW-UP.md`**

Change the release artifact remaining item to state:

```markdown
- Release smoke artifact foundation: browser reconnect smoke is preserved as a release workflow
  artifact, and Android/Electron smoke scripts can write the same sanitized JSON locally or on a
  self-hosted runner. Remaining automation is self-hosted Android device scheduling and macOS
  packaged UX evidence.
```

- [x] **Step 3: Add handoff**

Create `docs/operations/2026-05-05-release-smoke-artifacts-handoff.md`:

```markdown
# 2026-05-05 Release Smoke Artifacts Handoff

## Scope

Added opt-in sanitized JSON artifact output for Browser/Electron/Android reconnect smoke evidence.

## Artifact Contract

Set `CODEXMUX_SMOKE_ARTIFACT_DIR` to write one JSON artifact per smoke run. Stdout JSON remains
unchanged for existing local workflows.

## Release Workflow

The tag release workflow runs `pnpm smoke:browser-reconnect` and uploads `smoke-browser-reconnect`
with 14-day retention. Android and packaged Electron evidence use the same artifact writer from
manual or self-hosted runs.

## Verification

- `corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts`
- `node --check scripts/smoke-browser-reconnect-dom.mjs`
- `node --check scripts/smoke-electron-runtime-v2.mjs`
- `node --check scripts/smoke-android-foreground-reconnect.mjs`
- `node --check scripts/smoke-android-runtime-v2-foreground.mjs`
- `node --check scripts/smoke-android-timeline-foreground.mjs`
- `CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-smoke-artifacts corepack pnpm smoke:browser-reconnect`

## Remaining Work

- Add a self-hosted Android device runner if release candidates should collect Android artifacts
  without an operator.
- Add macOS packaged app artifact capture after the Mac release packaging path is available.
```

### Task 6: Verification

**Files:**
- No new files beyond previous tasks.

- [x] **Step 1: Run focused unit test**

```bash
corepack pnpm test tests/unit/scripts/smoke-artifact-lib.test.ts
```

Expected: PASS.

- [x] **Step 2: Run edited script syntax checks**

```bash
node --check scripts/smoke-artifact-lib.mjs
node --check scripts/smoke-browser-reconnect-dom.mjs
node --check scripts/smoke-electron-runtime-v2.mjs
node --check scripts/smoke-android-foreground-reconnect.mjs
node --check scripts/smoke-android-runtime-v2-foreground.mjs
node --check scripts/smoke-android-timeline-foreground.mjs
```

Expected: all commands pass with no output.

- [x] **Step 3: Run browser reconnect artifact smoke**

```bash
rm -rf /tmp/codexmux-smoke-artifacts
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-smoke-artifacts corepack pnpm smoke:browser-reconnect
ls -1 /tmp/codexmux-smoke-artifacts
```

Expected: smoke passes and exactly one `browser-reconnect-*-passed.json` artifact exists.

- [x] **Step 4: Check sensitive strings are absent**

```bash
rg -n "serverOutput|homeDir|prompt body|\\.codex/sessions|secret-" /tmp/codexmux-smoke-artifacts
```

Expected: command exits non-zero because no sensitive strings are present.

- [x] **Step 5: Run project-level checks**

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
git diff --check
```

Expected: all commands pass.

## Self-Review

- Spec coverage: helper, targeted smoke scripts, release workflow artifact upload, docs, and handoff are covered by Tasks 1-6.
- Placeholder scan: no task uses unresolved placeholder language; each code edit has concrete snippets or exact command output expectations.
- Type and name consistency: `writeSmokeArtifact`, `sanitizeSmokeArtifactPayload`, `buildSmokeArtifactFilename`, `CODEXMUX_SMOKE_ARTIFACT_DIR`, and smoke names are consistent across tests, scripts, workflow, and docs.
