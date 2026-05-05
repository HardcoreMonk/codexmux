# Operations Automation Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the six remaining operations items into safe automation, measured perf work, and explicit follow-up evidence.

**Architecture:** The batch is split into independent evidence-producing slices. CI/smoke work uses sanitized artifact files; perf work reuses stats parsing within a process-level TTL; approval copy uses status-owned sanitized prompt metadata; lifecycle rollback remains dry-run/spec-only.

**Tech Stack:** Next.js Pages Router, TypeScript, Node `.mjs` smoke scripts, GitHub Actions, Vitest, pnpm.

---

## File Structure

- Create: `.github/workflows/platform-smoke-artifacts.yml`
  Optional workflow-dispatch evidence workflow for browser, Electron, and self-hosted Android smoke artifacts.
- Modify: `src/lib/stats/jsonl-parser.ts`
  Add shared in-memory/in-flight parsed session stats reuse for `projects` and `sessions`.
- Modify: `tests/unit/lib/stats-codex.test.ts`
  Add coverage that concurrent project/session stats share one parse path.
- Modify: `src/lib/approval-queue.ts`
  Add a sanitized push/lock-screen body builder from approval metadata.
- Modify: `src/types/status.ts`, `src/hooks/use-tab-store.ts`, `src/lib/status-manager.ts`
  Carry parsed approval metadata on `needs-input` status entries and use it in Web Push payload/body.
- Modify: `src/lib/runtime/ipc.ts`, `src/lib/runtime/status/web-push-actions.ts`
  Allow optional approval detail text through runtime v2 Web Push IPC.
- Modify: `tests/unit/lib/approval-queue.test.ts`, `tests/unit/lib/runtime/ipc.test.ts`, `tests/unit/lib/runtime/status-worker-service.test.ts`
  Cover approval copy and IPC schema compatibility.
- Create: `scripts/lifecycle-rollback-dry-run-lib.mjs`
  Pure helper for reading systemd rollback state without mutation.
- Create: `scripts/lifecycle-rollback-dry-run.mjs`
  CLI wrapper that prints rollback dry-run JSON.
- Modify: `package.json`
  Add `lifecycle:rollback-dry-run` and `smoke:ops:batch`.
- Create: `scripts/ops-smoke-batch.mjs`
  Local evidence runner that records automatic and manual-required smoke rows.
- Modify: `docs/TESTING.md`, `docs/SYSTEMD.md`, `docs/PERFORMANCE.md`, `docs/FOLLOW-UP.md`
  Document workflows, perf measurements, lifecycle dry-run, and remaining manual smoke boundaries.
- Create: `docs/operations/2026-05-06-ops-automation-batch-handoff.md`
  Handoff record for the implemented batch and verification commands.

---

### Task 1: Optional Platform Smoke Artifact Workflow

**Files:**
- Create: `.github/workflows/platform-smoke-artifacts.yml`
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Add workflow-dispatch artifact workflow**

Create `.github/workflows/platform-smoke-artifacts.yml`:

```yaml
name: Platform Smoke Artifacts

on:
  workflow_dispatch:
    inputs:
      run_browser:
        description: Run browser reconnect smoke on GitHub-hosted Ubuntu.
        required: true
        default: 'true'
        type: choice
        options: ['true', 'false']
      run_electron_runtime_v2:
        description: Run Electron runtime v2 smoke on GitHub-hosted macOS.
        required: true
        default: 'false'
        type: choice
        options: ['true', 'false']
      run_android_device:
        description: Run Android device smokes on a self-hosted codexmux Android runner.
        required: true
        default: 'false'
        type: choice
        options: ['true', 'false']

concurrency:
  group: platform-smoke-artifacts-${{ github.ref }}
  cancel-in-progress: false

jobs:
  browser-reconnect:
    if: inputs.run_browser == 'true'
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

  electron-runtime-v2:
    if: inputs.run_electron_runtime_v2 == 'true'
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:electron:runtime-v2
      - uses: actions/upload-artifact@v7
        with:
          name: smoke-electron-runtime-v2
          path: artifacts/smoke/*.json
          if-no-files-found: error
          retention-days: 14

  android-device:
    if: inputs.run_android_device == 'true'
    runs-on: [self-hosted, codexmux-android]
    steps:
      - uses: actions/checkout@v6
      - uses: pnpm/action-setup@v5
      - uses: actions/setup-node@v6
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:android:foreground
      - run: CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:android:runtime-v2
      - run: CODEXMUX_SMOKE_ARTIFACT_DIR=artifacts/smoke pnpm smoke:android:timeline-foreground
      - uses: actions/upload-artifact@v7
        with:
          name: smoke-android-device
          path: artifacts/smoke/*.json
          if-no-files-found: error
          retention-days: 14
```

- [ ] **Step 2: Validate workflow YAML surface**

Run:

```bash
corepack pnpm exec prettier --check .github/workflows/platform-smoke-artifacts.yml
```

Expected: pass or no Prettier config match. If the repo does not format YAML through Prettier, verify with:

```bash
node -e "const fs=require('fs'); const s=fs.readFileSync('.github/workflows/platform-smoke-artifacts.yml','utf8'); if(!s.includes('workflow_dispatch')) process.exit(1)"
```

- [ ] **Step 3: Update docs**

Add a `Platform smoke artifacts` subsection to `docs/TESTING.md` explaining:

```markdown
`Platform Smoke Artifacts` is a manual `workflow_dispatch` workflow. Browser reconnect can run on GitHub-hosted Ubuntu. Electron runtime v2 can run on GitHub-hosted macOS when the runner supports Electron DevTools. Android foreground/runtime/timeline smokes require a self-hosted runner labeled `codexmux-android`; GitHub-hosted runners do not provide the required real device, ADB session, WebView DevTools target, or Tailscale route.
```

Update `docs/FOLLOW-UP.md` to mark optional artifact workflow scaffolding complete while keeping self-hosted runner provisioning and packaged Mac UX as remaining external evidence.

- [ ] **Step 4: Commit checkpoint when requested**

Do not commit automatically unless the user asks. If requested:

```bash
git add .github/workflows/platform-smoke-artifacts.yml docs/TESTING.md docs/FOLLOW-UP.md
git commit -m "chore: add optional platform smoke artifacts"
```

---

### Task 2: Stats Parsed Session Reuse

**Files:**
- Modify: `src/lib/stats/jsonl-parser.ts`
- Modify: `tests/unit/lib/stats-codex.test.ts`
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Write failing test for shared parsed stats**

Append to `tests/unit/lib/stats-codex.test.ts`:

```typescript
  it('reuses parsed session stats between project and session summaries', async () => {
    const { parseAllProjects, parseAllSessions } = await import('@/lib/stats/jsonl-parser');
    const { getPerfRuntimeSnapshot } = await import('@/lib/perf-metrics');

    const [projects, sessions] = await Promise.all([
      parseAllProjects('7d'),
      parseAllSessions('7d'),
    ]);

    expect(projects).toHaveLength(1);
    expect(sessions).toHaveLength(1);
    const snapshot = getPerfRuntimeSnapshot();
    expect(snapshot.counters['stats.session_parse.miss']).toBe(1);
    expect(snapshot.counters['stats.session_parse.inflight_join']).toBeGreaterThanOrEqual(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
corepack pnpm test tests/unit/lib/stats-codex.test.ts
```

Expected: fail because `stats.session_parse.*` counters are not recorded and `parseAllProjects` has its own parse path.

- [ ] **Step 3: Implement shared parsed session cache**

Modify `src/lib/stats/jsonl-parser.ts`:

```typescript
const SESSION_STATS_TTL_MS = 60_000;
const sessionStatsCache = new Map<TPeriod, { expiresAt: number; data: ISessionStats[] }>();
const sessionStatsInflight = new Map<TPeriod, Promise<ISessionStats[]>>();

const parseSessionStatsForPeriod = async (period: TPeriod): Promise<ISessionStats[]> => {
  const targetDates = dateStringsForPeriod(period);
  const collectedFiles = await collectAgentJsonlFiles();
  const files = targetDates ? filterAgentJsonlFilesByDates(collectedFiles, targetDates) : collectedFiles;
  if (files.length === 0) return [];

  const tasks = files.map((f) => () => parseJsonlStream(f, period));
  const allResults = await runWithConcurrency(tasks, CONCURRENCY_LIMIT);
  const sessions: ISessionStats[] = [];

  for (const fileResults of allResults) {
    for (const s of fileResults) {
      sessions.push({
        sessionId: s.sessionId,
        project: s.project,
        startedAt: s.startedAt,
        lastActivityAt: s.lastActivityAt,
        messageCount: s.messageCount,
        totalTokens: s.totalInputTokens + s.totalOutputTokens,
        model: s.model,
      });
    }
  }

  return sessions.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
};

export const parseAllSessions = async (period: TPeriod): Promise<ISessionStats[]> => {
  const cached = sessionStatsCache.get(period);
  if (cached && Date.now() < cached.expiresAt) {
    recordPerfCounter('stats.session_parse.memory_hit');
    return cached.data;
  }

  const inflight = sessionStatsInflight.get(period);
  if (inflight) {
    recordPerfCounter('stats.session_parse.inflight_join');
    return inflight;
  }

  recordPerfCounter('stats.session_parse.miss');
  const startedAt = getPerfNow();
  const task = parseSessionStatsForPeriod(period)
    .then((data) => {
      sessionStatsCache.set(period, { data, expiresAt: Date.now() + SESSION_STATS_TTL_MS });
      return data;
    })
    .finally(() => {
      recordPerfDuration(`stats.session_parse.${period}`, getPerfNow() - startedAt);
      sessionStatsInflight.delete(period);
    });

  sessionStatsInflight.set(period, task);
  return task;
};
```

Also import `getPerfNow`, `recordPerfCounter`, and `recordPerfDuration` from `@/lib/perf-metrics`.

- [ ] **Step 4: Refactor projects to reuse sessions**

Replace the file-scan body of `parseAllProjects` in `src/lib/stats/jsonl-parser.ts` with aggregation over `await parseAllSessions(period)`:

```typescript
export const parseAllProjects = async (period: TPeriod): Promise<IProjectStats[]> => {
  const sessions = await parseAllSessions(period);
  if (sessions.length === 0) return [];

  const projectMap = new Map<string, IProjectStats>();
  for (const s of sessions) {
    const existing = projectMap.get(s.project);
    if (existing) {
      existing.sessionCount++;
      existing.messageCount += s.messageCount;
      existing.totalTokens += s.totalTokens;
    } else {
      projectMap.set(s.project, {
        project: s.project,
        sessionCount: 1,
        messageCount: s.messageCount,
        totalTokens: s.totalTokens,
      });
    }
  }

  return Array.from(projectMap.values()).sort((a, b) => b.totalTokens - a.totalTokens);
};
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
corepack pnpm test tests/unit/lib/stats-codex.test.ts
```

Expected: pass.

- [ ] **Step 6: Capture live perf before/after**

Before deployment, record current live values:

```bash
curl -sS http://127.0.0.1:8122/api/debug/perf
```

After deployment, hit stats endpoints in parallel and re-read perf:

```bash
curl -sS 'http://127.0.0.1:8122/api/stats/projects?period=7d' >/tmp/codexmux-projects-7d.json &
curl -sS 'http://127.0.0.1:8122/api/stats/sessions?period=7d' >/tmp/codexmux-sessions-7d.json &
wait
curl -sS http://127.0.0.1:8122/api/debug/perf
```

Expected: `stats.session_parse.7d` appears once for the shared parse window and `stats.session_parse.inflight_join` increments when the two endpoints overlap.

---

### Task 3: Approval Lock-Screen Copy From Parsed Metadata

**Files:**
- Modify: `src/lib/approval-queue.ts`
- Modify: `src/types/status.ts`
- Modify: `src/hooks/use-tab-store.ts`
- Modify: `src/lib/status-manager.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/status/web-push-actions.ts`
- Modify: `tests/unit/lib/approval-queue.test.ts`
- Modify: `tests/unit/lib/runtime/ipc.test.ts`
- Modify: `tests/unit/lib/runtime/status-worker-service.test.ts`
- Modify: `docs/STATUS.md`

- [ ] **Step 1: Write approval copy helper test**

Add to `tests/unit/lib/approval-queue.test.ts`:

```typescript
  it('builds concise lock-screen copy from approval metadata', () => {
    const baseMetadata: IApprovalPromptMetadata = {
      promptType: 'command',
      approvalKind: 'allow',
      riskLevel: 'medium',
      commandPreview: 'corepack pnpm test',
      fileHints: [],
      fallbackReason: null,
    };

    expect(buildApprovalPushBody({ metadata: baseMetadata, fallbackText: 'Run tests?' })).toBe(
      'Command approval · medium · corepack pnpm test',
    );
    expect(buildApprovalPushBody({
      metadata: { ...baseMetadata, promptType: 'file', commandPreview: null, fileHints: ['server.ts', 'status.ts'] },
      fallbackText: 'Edit files?',
    })).toBe('File approval · medium · server.ts, status.ts');
    expect(buildApprovalPushBody({ metadata: null, fallbackText: 'Run tests?' })).toBe('Run tests?');
  });
```

- [ ] **Step 2: Implement helper**

Modify `src/lib/approval-queue.ts`:

```typescript
const APPROVAL_PUSH_TYPE_LABELS: Record<TApprovalPromptType, string> = {
  command: 'Command approval',
  file: 'File approval',
  permission: 'Permission approval',
  'resume-directory': 'Directory approval',
  conversation: 'Conversation choice',
  unknown: 'Input required',
};

export const buildApprovalPushBody = ({
  metadata,
  fallbackText,
  maxLength = 120,
}: {
  metadata: IApprovalPromptMetadata | null;
  fallbackText: string;
  maxLength?: number;
}): string => {
  const fallback = fallbackText.trim();
  if (!metadata || metadata.promptType === 'unknown') return fallback.slice(0, maxLength);

  const detail = getApprovalMetadataDetail(metadata);
  const parts = [
    APPROVAL_PUSH_TYPE_LABELS[metadata.promptType],
    metadata.riskLevel !== 'unknown' ? metadata.riskLevel : null,
    detail,
  ].filter((part): part is string => !!part && part.trim().length > 0);

  const body = parts.join(' · ');
  return (body || fallback).slice(0, maxLength);
};
```

- [ ] **Step 3: Carry approval metadata through status entries**

Add `approvalPromptMetadata?: IApprovalPromptMetadata | null` to:

- `ITabStatusEntry` in `src/types/status.ts`
- `IClientTabStatusEntry` derived output by including it in `getAllForClient()`
- `IStatusUpdateMessage` in `src/types/status.ts`
- `ITabState` and `syncAllFromServer`/`updateFromServer` shapes in `src/hooks/use-tab-store.ts`

Import the type from `@/lib/permission-prompt` where needed.

- [ ] **Step 4: Populate metadata during pane recovery**

In `src/lib/status-manager.ts`, change `recoverPendingInputFromPane`:

```typescript
const { options, metadata } = parsePermissionOptions(content);
if (options.length === 0) return { recovered: false, reason: 'no-options' };
entry.approvalPromptMetadata = metadata;
```

In `applyCliState`, clear stale approval metadata when leaving `needs-input`:

```typescript
if (newState !== 'needs-input') {
  entry.approvalPromptMetadata = null;
}
```

Ensure `broadcastUpdate()` and `getAllForClient()` include `approvalPromptMetadata`.

- [ ] **Step 5: Use metadata in Web Push payload**

In `src/lib/status-manager.ts`, import `buildApprovalPushBody` and build the body:

```typescript
const fallbackBody = entry.lastUserMessage?.slice(0, 100) || entry.tabName || tabId;
const approvalPromptMetadata = pushType === 'needs-input' ? entry.approvalPromptMetadata ?? null : null;
const body = pushType === 'needs-input'
  ? buildApprovalPushBody({ metadata: approvalPromptMetadata, fallbackText: fallbackBody })
  : fallbackBody;
const approvalMetadata = pushType === 'needs-input'
  ? {
    approvalKind: approvalPromptMetadata?.approvalKind ?? 'unknown',
    promptType: approvalPromptMetadata?.promptType ?? 'unknown',
    riskLevel: approvalPromptMetadata?.riskLevel ?? 'unknown',
    approvalDetail: getApprovalMetadataDetail(approvalPromptMetadata) ?? null,
  }
  : {};
```

- [ ] **Step 6: Extend runtime v2 Web Push IPC schema**

Add optional `approvalDetail: z.string().nullable().optional()` to `statusWebPushPayloadSchema` in `src/lib/runtime/ipc.ts`.

Add `approvalDetail?: string | null;` to `IStatusWebPushPayload` in `src/lib/runtime/status/web-push-actions.ts`.

Update IPC/status-worker tests so payloads with `approvalDetail` pass strict validation.

- [ ] **Step 7: Run focused tests**

Run:

```bash
corepack pnpm test tests/unit/lib/approval-queue.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
```

Expected: pass.

- [ ] **Step 8: Update status docs**

Update `docs/STATUS.md` notification section to state:

```markdown
When pane recovery parses a permission/input prompt, `StatusManager` stores sanitized `approvalPromptMetadata` on the needs-input status entry. Web Push lock-screen copy uses that metadata for command/file/permission type, risk, and concise detail. If metadata is absent, the previous last-user-message/tab-name fallback remains.
```

---

### Task 4: Lifecycle Rollback Dry-Run Boundary

**Files:**
- Create: `scripts/lifecycle-rollback-dry-run-lib.mjs`
- Create: `scripts/lifecycle-rollback-dry-run.mjs`
- Modify: `package.json`
- Modify: `docs/SYSTEMD.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Add pure dry-run helper**

Create `scripts/lifecycle-rollback-dry-run-lib.mjs`:

```javascript
import fs from 'fs/promises';
import os from 'os';
import path from 'path';

const runtimeEnvRe = /^Environment=(CODEXMUX_RUNTIME_[A-Z0-9_]+)=(.*)$/;

export const getDefaultRuntimeDropInPath = (homeDir = os.homedir()) =>
  path.join(homeDir, '.config', 'systemd', 'user', 'codexmux.service.d', 'runtime-v2-shadow.conf');

export const parseRuntimeDropIn = (content) => {
  const env = {};
  for (const line of content.split('\n')) {
    const match = line.trim().match(runtimeEnvRe);
    if (match) env[match[1]] = match[2];
  }
  return env;
};

export const buildLifecycleRollbackDryRun = async ({
  dropInPath = getDefaultRuntimeDropInPath(),
} = {}) => {
  let exists = false;
  let runtimeEnv = {};
  try {
    const content = await fs.readFile(dropInPath, 'utf8');
    exists = true;
    runtimeEnv = parseRuntimeDropIn(content);
  } catch {
    exists = false;
  }

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    service: 'codexmux.service',
    dropInPath,
    dropInExists: exists,
    runtimeEnv,
    mutates: false,
    commands: exists
      ? [
        `rm ${dropInPath}`,
        'systemctl --user daemon-reload',
        'systemctl --user restart codexmux.service',
      ]
      : [
        'systemctl --user daemon-reload',
        'systemctl --user restart codexmux.service',
      ],
    warnings: exists ? [] : ['runtime drop-in not found; rollback may already be applied'],
  };
};
```

- [ ] **Step 2: Add CLI wrapper**

Create `scripts/lifecycle-rollback-dry-run.mjs`:

```javascript
#!/usr/bin/env node
import { buildLifecycleRollbackDryRun } from './lifecycle-rollback-dry-run-lib.mjs';

const main = async () => {
  const result = await buildLifecycleRollbackDryRun();
  console.log(JSON.stringify(result, null, 2));
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'lifecycle-rollback-dry-run-failed',
    message: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
```

- [ ] **Step 3: Add package script**

Modify `package.json` scripts:

```json
"lifecycle:rollback-dry-run": "node scripts/lifecycle-rollback-dry-run.mjs"
```

- [ ] **Step 4: Verify no mutation**

Run:

```bash
node --check scripts/lifecycle-rollback-dry-run-lib.mjs
node --check scripts/lifecycle-rollback-dry-run.mjs
corepack pnpm lifecycle:rollback-dry-run
```

Expected: JSON includes `"mutates": false`.

- [ ] **Step 5: Document the boundary**

Update `docs/SYSTEMD.md` lifecycle section:

```markdown
`corepack pnpm lifecycle:rollback-dry-run` prints the rollback commands and currently detected runtime-v2 drop-in environment without mutating files or running systemctl. The executable UI still exposes only `phase6-gate`, `restart-service`, and `deploy-local`.
```

Update `docs/FOLLOW-UP.md`: rollback flag mutation, drop-in editing, and automated rollback drill remain separate spec work.

---

### Task 5: Local Operations Smoke Batch Evidence

**Files:**
- Create: `scripts/ops-smoke-batch.mjs`
- Modify: `package.json`
- Modify: `docs/TESTING.md`
- Modify: `docs/FOLLOW-UP.md`

- [ ] **Step 1: Add smoke batch runner**

Create `scripts/ops-smoke-batch.mjs`:

```javascript
#!/usr/bin/env node
import { spawn } from 'child_process';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { writeSmokeArtifact } from './smoke-artifact-lib.mjs';

const startedAt = new Date().toISOString();
const artifactRoot = process.env.CODEXMUX_SMOKE_ARTIFACT_DIR
  || path.join(os.tmpdir(), `codexmux-ops-smoke-${Date.now()}`);

const run = (name, args, env = {}) => new Promise((resolve) => {
  const child = spawn('corepack', ['pnpm', ...args], {
    cwd: process.cwd(),
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot, ...env },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  const started = Date.now();
  child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
  child.on('exit', (code) => {
    resolve({
      name,
      status: code === 0 ? 'passed' : 'failed',
      durationMs: Date.now() - started,
      exitCode: code,
      error: code === 0 ? null : stderr.slice(-400),
    });
  });
});

const main = async () => {
  await fs.mkdir(artifactRoot, { recursive: true });
  const rows = [];

  rows.push(await run('browser-reconnect', ['smoke:browser-reconnect']));

  if (process.env.CODEXMUX_OPS_SMOKE_PWA_URL) {
    rows.push(await run('pwa', ['smoke:pwa'], { CODEXMUX_PWA_SMOKE_URL: process.env.CODEXMUX_OPS_SMOKE_PWA_URL }));
  } else {
    rows.push({ name: 'pwa', status: 'manual-required', reason: 'CODEXMUX_OPS_SMOKE_PWA_URL not set' });
  }

  if (process.env.CODEXMUX_OPS_SMOKE_RUNTIME_URL) {
    rows.push(await run('runtime-v2-phase6-default-gate', ['smoke:runtime-v2:phase6-default-gate'], {
      CODEXMUX_RUNTIME_V2_SMOKE_URL: process.env.CODEXMUX_OPS_SMOKE_RUNTIME_URL,
    }));
  } else {
    rows.push({ name: 'runtime-v2-phase6-default-gate', status: 'manual-required', reason: 'CODEXMUX_OPS_SMOKE_RUNTIME_URL not set' });
  }

  rows.push({ name: 'ipad-pwa-long-background', status: 'manual-required', reason: 'requires real iPad/PWA background run' });
  rows.push({ name: 'mac-packaged-ux', status: 'manual-required', reason: 'requires packaged app UX run on macOS desktop session' });

  const failed = rows.some((row) => row.status === 'failed');
  const payload = {
    ok: !failed,
    artifactRoot,
    rows,
  };
  await writeSmokeArtifact({
    smokeName: 'ops-smoke-batch',
    status: failed ? 'failed' : 'passed',
    startedAt,
    payload,
    env: { ...process.env, CODEXMUX_SMOKE_ARTIFACT_DIR: artifactRoot },
  });
  console.log(JSON.stringify(payload, null, 2));
  process.exit(failed ? 1 : 0);
};

main().catch((err) => {
  console.error(JSON.stringify({
    ok: false,
    code: 'ops-smoke-batch-failed',
    message: err instanceof Error ? err.message : String(err),
  }, null, 2));
  process.exit(1);
});
```

- [ ] **Step 2: Add package script**

Modify `package.json` scripts:

```json
"smoke:ops:batch": "node scripts/ops-smoke-batch.mjs"
```

- [ ] **Step 3: Verify syntax**

Run:

```bash
node --check scripts/ops-smoke-batch.mjs
```

Expected: pass.

- [ ] **Step 4: Run local batch when appropriate**

Run only when browser reconnect smoke can safely create a temp server:

```bash
CODEXMUX_SMOKE_ARTIFACT_DIR=/tmp/codexmux-ops-smoke corepack pnpm smoke:ops:batch
```

Expected: browser reconnect passes; PWA/runtime/iPad/Mac rows are either passed when env is configured or `manual-required`.

- [ ] **Step 5: Document evidence rows**

Update `docs/TESTING.md` with `smoke:ops:batch` usage and the meaning of `manual-required`.

Update `docs/FOLLOW-UP.md` so long external smoke remains open until real device/package evidence exists.

---

### Task 6: Docs, Handoff, And Final Verification

**Files:**
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/FOLLOW-UP.md`
- Create: `docs/operations/2026-05-06-ops-automation-batch-handoff.md`

- [ ] **Step 1: Update performance docs**

Append to `docs/PERFORMANCE.md`:

```markdown
### 2026-05-06 stats shared parse reuse

`parseAllProjects(period)` now reuses `parseAllSessions(period)` through a 60s in-process TTL and an in-flight promise. This targets dashboard loads where projects and sessions are requested together. `/api/debug/perf` exposes `stats.session_parse.<period>`, `stats.session_parse.miss`, `stats.session_parse.memory_hit`, and `stats.session_parse.inflight_join`.
```

Add measured before/after numbers after deployment.

- [ ] **Step 2: Update follow-up docs**

In `docs/FOLLOW-UP.md`, move these to done/in-progress as appropriate:

- optional platform smoke artifact workflow scaffolding
- stats shared parse reuse
- approval lock-screen copy from parsed metadata
- lifecycle rollback dry-run
- local ops smoke batch evidence runner

Keep these open:

- real Android self-hosted runner provisioning
- real iPad/PWA long-background evidence
- Mac packaged UX smoke evidence
- rollback mutation/drop-in editing/rollback drill automation
- Post-MVP fork/sub-agent UI and app-server adapter

- [ ] **Step 3: Create handoff**

Create `docs/operations/2026-05-06-ops-automation-batch-handoff.md`:

```markdown
# Ops Automation Batch Handoff

Date: 2026-05-06

## Implemented

- Optional platform smoke artifact workflow.
- Shared stats session parse reuse.
- Approval needs-input Web Push copy from sanitized parsed metadata.
- Lifecycle rollback dry-run CLI.
- Local ops smoke batch evidence runner.

## Verification

| Check | Result |
| --- | --- |
| `corepack pnpm test tests/unit/lib/stats-codex.test.ts` | pending |
| `corepack pnpm test tests/unit/lib/approval-queue.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/status-worker-service.test.ts` | pending |
| `node --check scripts/lifecycle-rollback-dry-run-lib.mjs` | pending |
| `node --check scripts/lifecycle-rollback-dry-run.mjs` | pending |
| `node --check scripts/ops-smoke-batch.mjs` | pending |
| `corepack pnpm tsc --noEmit` | pending |
| `corepack pnpm lint` | pending |

## Remaining External Evidence

- Android self-hosted runner or manual device smoke artifacts.
- iPad/PWA long background evidence.
- Mac packaged UX evidence.
- Rollback mutation/drop-in editing/drill automation under a separate spec.
```

- [ ] **Step 4: Run final verification**

Run:

```bash
corepack pnpm test tests/unit/lib/stats-codex.test.ts
corepack pnpm test tests/unit/lib/approval-queue.test.ts tests/unit/lib/runtime/ipc.test.ts tests/unit/lib/runtime/status-worker-service.test.ts
node --check scripts/lifecycle-rollback-dry-run-lib.mjs
node --check scripts/lifecycle-rollback-dry-run.mjs
node --check scripts/ops-smoke-batch.mjs
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: all pass.

- [ ] **Step 5: Deployment verification when requested**

After user requests deploy:

```bash
corepack pnpm deploy:local
curl -fsS http://127.0.0.1:8122/api/health
curl -fsS http://127.0.0.1:8122/api/debug/perf
```

Expected: health commit matches the deployed commit, service is active, and perf counters include the new stats session parse metrics after stats endpoints are hit.

---

## Self-Review

- Spec coverage: all six approved items map to a concrete task or an explicit deferred boundary.
- Placeholder scan: no task depends on undefined files or hidden behavior.
- Scope check: lifecycle rollback mutation and external hardware evidence are intentionally not implemented as unattended actions.
- Type consistency: approval metadata uses the existing `IApprovalPromptMetadata` contract and optional status fields preserve current clients.
