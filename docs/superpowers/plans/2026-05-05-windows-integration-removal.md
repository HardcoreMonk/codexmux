# Windows Integration Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do not use subagents unless the user explicitly asks for delegated agent work.

**Goal:** Remove Windows device integration and make codexmux local macOS/Linux session management only.

**Architecture:** Delete Windows companion sync and terminal bridge surfaces, then simplify shared session/timeline contracts so only local `~/.codex/sessions/**/*.jsonl` entries are indexed and opened. Existing tmux terminal, runtime v2 terminal, Electron, and Android behavior remain in place.

**Tech Stack:** Next.js Pages Router, custom Node server, TypeScript, Vitest, pnpm, Eleventy landing docs.

---

## File Structure

**Delete Windows-only code and tests:**

- `scripts/windows-codex-sync.mjs`
- `scripts/windows-codex-sync-task.ps1`
- `scripts/windows-sync-smoke-lib.mjs`
- `scripts/smoke-windows-sync.mjs`
- `scripts/windows-terminal-bridge.mjs`
- `scripts/windows-terminal-bridge-lib.mjs`
- `src/lib/remote-codex-store.ts`
- `src/lib/remote-terminal-store.ts`
- `src/lib/remote-terminal-server.ts`
- `src/lib/windows-terminal-link.ts`
- `src/hooks/use-remote-codex-sources.ts`
- `src/hooks/use-remote-terminal-sources.ts`
- `src/components/features/remote-terminal/remote-terminal-page.tsx`
- `src/pages/windows-terminal.tsx`
- `src/pages/api/remote/codex/sync.ts`
- `src/pages/api/remote/codex/sources.ts`
- `src/pages/api/remote/terminal/register.ts`
- `src/pages/api/remote/terminal/commands.ts`
- `src/pages/api/remote/terminal/output.ts`
- `src/pages/api/remote/terminal/sources.ts`
- `src/types/remote-terminal.ts`
- `tests/unit/lib/remote-terminal-store.test.ts`
- `tests/unit/lib/windows-terminal-link.test.ts`
- `tests/unit/scripts/windows-sync-smoke-lib.test.ts`
- `tests/unit/scripts/windows-terminal-bridge-lib.test.ts`
- `docs/WINDOWS.md`
- `docs/operations/2026-05-04-windows-terminal-bridge-preflight-handoff.md`

**Modify local-only runtime and UI contracts:**

- `package.json`
- `server.ts`
- `src/types/timeline.ts`
- `src/lib/path-validation.ts`
- `src/lib/session-index.ts`
- `src/lib/session-list.ts`
- `src/pages/api/timeline/sessions.ts`
- `src/pages/api/v2/timeline/sessions.ts`
- `src/lib/runtime/contracts.ts`
- `src/lib/runtime/ipc.ts`
- `src/lib/runtime/supervisor.ts`
- `src/lib/runtime/timeline/worker-service.ts`
- `src/hooks/use-session-list.ts`
- `src/hooks/use-terminal-websocket.ts`
- `src/lib/terminal-websocket-url.ts`
- `src/components/features/mobile/mobile-agent-panel.tsx`
- `src/components/features/workspace/session-list-view.tsx`
- `src/components/features/workspace/session-list-item.tsx`
- `messages/en/terminal.json`
- `messages/ko/terminal.json`

**Modify tests:**

- `tests/unit/lib/session-index.test.ts`
- `tests/unit/lib/path-validation.test.ts`
- `tests/unit/lib/terminal-websocket-url.test.ts`
- `tests/unit/pages/timeline-sessions.test.ts`
- `tests/unit/pages/runtime-v2-api.test.ts`
- `tests/unit/lib/runtime/supervisor.test.ts`
- `tests/unit/lib/runtime/ipc.test.ts`

**Modify documentation:**

- `README.md`
- `docs/README.md`
- `docs/ADR.md`
- `docs/ARCHITECTURE-LOGIC.md`
- `docs/STATUS.md`
- `docs/TMUX.md`
- `docs/DATA-DIR.md`
- `docs/TESTING.md`
- `docs/PERFORMANCE.md`
- `docs/RUNTIME-V2-PARITY.md`
- `docs/RUNTIME-V2-CUTOVER.md`
- `docs/FOLLOW-UP.md`
- `docs/operations/2026-05-04-release-v0.4.1-handoff.md`
- `landing-src/docs/**/{architecture,installation,quickstart,troubleshooting,data-directory,session-status}.md`
- `landing-src/*.njk`

## Task 1: Regression Tests For Local-Only Session History

**Files:**
- Modify: `tests/unit/lib/session-index.test.ts`
- Create: `tests/unit/lib/path-validation.test.ts`
- Modify: `tests/unit/pages/timeline-sessions.test.ts`
- Modify: `tests/unit/pages/runtime-v2-api.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify: `tests/unit/lib/runtime/ipc.test.ts`

- [ ] **Step 1: Replace the persisted remote row test**

In `tests/unit/lib/session-index.test.ts`, replace the test named `filters legacy persisted remote rows by source id from the index key` with this local-only regression:

```typescript
  it('drops legacy persisted remote rows from the session index', async () => {
    const indexDir = path.join(tempHome, '.codexmux');
    await fs.mkdir(indexDir, { recursive: true });
    await fs.writeFile(
      path.join(indexDir, 'session-index.json'),
      JSON.stringify({
        version: 1,
        updatedAt: '2026-05-02T00:00:00.000Z',
        sessions: [
          {
            indexKey: 'remote:win11:019dcf70-3a02-73a0-a79e-8703b99a2f38:/remote/win11.jsonl',
            indexJsonlPath: '/remote/win11.jsonl',
            indexMtimeMs: 1,
            indexSize: 1,
            sessionId: '019dcf70-3a02-73a0-a79e-8703b99a2f38',
            startedAt: '2026-05-02T00:00:00.000Z',
            lastActivityAt: '2026-05-02T00:00:01.000Z',
            firstMessage: 'Legacy Windows row',
            turnCount: 1,
            source: 'remote',
            sourceLabel: 'WIN11 / pwsh',
          },
        ],
      }),
    );

    const { getSessionIndexPage } = await import('@/lib/session-index');
    const page = await getSessionIndexPage({ waitForInitial: false });

    expect(page.total).toBe(0);
    expect(page.sessions).toEqual([]);
  });
```

- [ ] **Step 2: Add path validation coverage**

Create `tests/unit/lib/path-validation.test.ts`:

```typescript
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('isAllowedJsonlPath', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('allows local Codex session JSONL paths', async () => {
    const home = path.join(os.tmpdir(), 'codexmux-path-validation-local');
    vi.stubEnv('HOME', home);

    const { isAllowedJsonlPath } = await import('@/lib/path-validation');

    expect(isAllowedJsonlPath(path.join(home, '.codex', 'sessions', '2026', '05', '05', 'session.jsonl'))).toBe(true);
  });

  it('rejects legacy remote Codex JSONL paths', async () => {
    const home = path.join(os.tmpdir(), 'codexmux-path-validation-remote');
    vi.stubEnv('HOME', home);

    const { isAllowedJsonlPath } = await import('@/lib/path-validation');

    expect(isAllowedJsonlPath(path.join(home, '.codexmux', 'remote', 'codex', 'win11', 'session.jsonl'))).toBe(false);
  });
});
```

- [ ] **Step 3: Update timeline sessions API expectations**

In `tests/unit/pages/timeline-sessions.test.ts`, change mock session data so it has no `source: 'remote'`. Update calls to `listSessionPage` so options only include pagination:

```typescript
expect(mocks.listSessionPage).toHaveBeenCalledWith(
  'dead-tmux-session',
  undefined,
  'codex',
  { offset: 0, limit: 50 },
);
```

Replace the source filter test with a stale-query regression:

```typescript
  it('ignores stale source filter query parameters', async () => {
    const response = createResponse();

    await handler(createRequest({
      tmuxSession: 'dead-tmux-session',
      panelType: 'codex',
      source: 'remote',
      sourceId: 'win11',
      limit: '10',
      offset: '20',
    }), response.res);

    expect(response.statusCode).toBe(200);
    expect(mocks.listSessionPage).toHaveBeenCalledWith(
      'dead-tmux-session',
      undefined,
      'codex',
      { offset: 20, limit: 10 },
    );
  });
```

- [ ] **Step 4: Update runtime v2 tests**

In `tests/unit/pages/runtime-v2-api.test.ts`, change the timeline session list test so stale `source` and `sourceId` query parameters are not forwarded:

```typescript
expect(mocks.supervisor.listTimelineSessions).toHaveBeenCalledWith({
  tmuxSession: 'pt-ws-pane-tab',
  cwd: undefined,
  panelType: 'codex',
  offset: 5,
  limit: 10,
});
```

In `tests/unit/lib/runtime/supervisor.test.ts`, remove `source` and `sourceId` from `supervisor.listTimelineSessions()` inputs and timeline worker expectations.

In `tests/unit/lib/runtime/ipc.test.ts`, update valid `timeline.list-sessions` payloads to omit `source` and `sourceId`, and update invalid payload expectations so the schema no longer accepts those fields.

- [ ] **Step 5: Run targeted tests and confirm they fail before implementation**

Run:

```bash
corepack pnpm vitest run \
  tests/unit/lib/session-index.test.ts \
  tests/unit/lib/path-validation.test.ts \
  tests/unit/pages/timeline-sessions.test.ts \
  tests/unit/pages/runtime-v2-api.test.ts \
  tests/unit/lib/runtime/supervisor.test.ts \
  tests/unit/lib/runtime/ipc.test.ts
```

Expected: FAIL because production code still imports remote stores, allows remote paths, and forwards source filters.

## Task 2: Simplify Shared Session And Timeline Contracts

**Files:**
- Modify: `src/types/timeline.ts`
- Modify: `src/lib/path-validation.ts`
- Modify: `src/lib/session-index.ts`
- Modify: `src/lib/session-list.ts`
- Modify: `src/pages/api/timeline/sessions.ts`
- Modify: `src/pages/api/v2/timeline/sessions.ts`
- Modify: `src/lib/runtime/contracts.ts`
- Modify: `src/lib/runtime/ipc.ts`
- Modify: `src/lib/runtime/supervisor.ts`
- Modify: `src/lib/runtime/timeline/worker-service.ts`
- Modify: `src/hooks/use-session-list.ts`

- [ ] **Step 1: Remove remote fields from timeline types**

In `src/types/timeline.ts`, replace `ISessionMeta` and remove `TSessionSourceFilter` plus `IRemoteCodexSourceStatus`:

```typescript
export interface ISessionMeta {
  sessionId: string;
  startedAt: string;
  lastActivityAt: string;
  firstMessage: string;
  turnCount: number;
  jsonlPath?: string;
  cwd?: string | null;
}
```

- [ ] **Step 2: Restrict JSONL path validation to local Codex sessions**

In `src/lib/path-validation.ts`, remove the `REMOTE_CODEX_DIR` import and use this implementation:

```typescript
import path from 'path';
import os from 'os';

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');

export const isAllowedJsonlPath = (filePath: string): boolean => {
  const resolved = path.resolve(filePath);
  return resolved.startsWith(CODEX_SESSIONS_DIR + path.sep) && resolved.endsWith('.jsonl');
};
```

- [ ] **Step 3: Make `session-index` local-only**

In `src/lib/session-index.ts`:

- Remove imports from `@/lib/remote-codex-store`.
- Remove `source` and `sourceId` from `ISessionIndexPageOptions`.
- Remove `indexSidecarMtimeMs`.
- Change `getRootKey()` to return only `getCodexSessionsDir()`.
- Change `readStoredIndex()` to filter out legacy remote rows:

```typescript
const readStoredIndex = async (): Promise<IIndexedSessionMeta[]> => {
  try {
    const raw = await fs.readFile(getIndexFilePath(), 'utf-8');
    const parsed = JSON.parse(raw) as ISessionIndexFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.sessions)) return [];
    return parsed.sessions.filter((session) => session.source !== 'remote');
  } catch {
    return [];
  }
};
```

- Remove `buildRemoteSourceLabel()`.
- Remove `buildRemoteSession()`.
- Remove the remote branch from `toPublicSession()`.
- Remove `source: 'local'` from `buildLocalSession()`.
- In `refreshSessionIndex()`, collect only local files:

```typescript
const localFiles = await collectJsonlFiles(getCodexSessionsDir());
const tasks = localFiles.map((file) => () => buildLocalSession(file, previousByPath));
```

- Set `state.indexedFiles = localFiles.length`.
- Remove `filterSessions()` and have `getSessionIndexPage()` paginate `state.sessions` directly.
- In `findIndexedCodexSessionJsonl()`, remove the `.filter((session) => session.source === 'local')` call.

- [ ] **Step 4: Remove source filters from session list service and APIs**

In `src/lib/session-list.ts`, remove `TSessionSourceFilter`, `source`, and `sourceId`:

```typescript
export interface IListSessionPageOptions {
  offset?: number;
  limit?: number;
}
```

Pass only `waitForInitial`, `offset`, and `limit` to `getSessionIndexPage()`.

In `src/pages/api/timeline/sessions.ts`, delete `parseSourceFilter()`, `source`, and `sourceId`. Call `listSessionPage()` with:

```typescript
{
  offset,
  limit,
}
```

In `src/pages/api/v2/timeline/sessions.ts`, delete the `TSessionSourceFilter` import, `parseSourceFilter()`, and `sourceId` forwarding.

- [ ] **Step 5: Remove source filters from runtime contracts**

In `src/lib/runtime/contracts.ts`, remove the `TSessionSourceFilter` import and delete `source` and `sourceId` from `IRuntimeTimelineSessionListInput`.

In `src/lib/runtime/ipc.ts`, update `timelineSessionMetaSchema` to match local `ISessionMeta`:

```typescript
const timelineSessionMetaSchema = z.object({
  sessionId: z.string(),
  startedAt: z.string(),
  lastActivityAt: z.string(),
  firstMessage: z.string(),
  turnCount: z.number(),
  jsonlPath: z.string().optional(),
  cwd: z.string().nullable().optional(),
});
```

Update `timelineListSessionsPayloadSchema`:

```typescript
const timelineListSessionsPayloadSchema = z.object({
  tmuxSession: z.string().min(1),
  cwd: z.string().optional(),
  panelType: z.string().min(1),
  offset: z.number().int().nonnegative(),
  limit: z.number().int().min(1).max(200),
});
```

In `src/lib/runtime/timeline/worker-service.ts`, call:

```typescript
return listSessionPage(input.tmuxSession, input.cwd, panelType, {
  offset: input.offset,
  limit: input.limit,
});
```

- [ ] **Step 6: Remove source filter parameters from the client hook**

In `src/hooks/use-session-list.ts`, remove `TSessionSourceFilter`, `source`, `sourceId`, `sourceIdRef`, and `params.set('sourceId', ...)`. Build `sessionKey` from:

```typescript
const sessionKey = `${panelType}:${tmuxSession}:${cwd ?? ''}`;
```

Do not append `source` or `sourceId` to the `/api/timeline/sessions` request.

- [ ] **Step 7: Run targeted tests**

Run:

```bash
corepack pnpm vitest run \
  tests/unit/lib/session-index.test.ts \
  tests/unit/lib/path-validation.test.ts \
  tests/unit/pages/timeline-sessions.test.ts \
  tests/unit/pages/runtime-v2-api.test.ts \
  tests/unit/lib/runtime/supervisor.test.ts \
  tests/unit/lib/runtime/ipc.test.ts
```

Expected: PASS.

## Task 3: Remove Windows Session List UI And Remote Hooks

**Files:**
- Modify: `src/components/features/mobile/mobile-agent-panel.tsx`
- Modify: `src/components/features/workspace/session-list-view.tsx`
- Modify: `src/components/features/workspace/session-list-item.tsx`
- Delete: `src/hooks/use-remote-codex-sources.ts`
- Delete: `src/hooks/use-remote-terminal-sources.ts`
- Delete: `src/lib/windows-terminal-link.ts`
- Delete: `tests/unit/lib/windows-terminal-link.test.ts`
- Modify: `messages/en/terminal.json`
- Modify: `messages/ko/terminal.json`

- [ ] **Step 1: Simplify `MobileAgentPanel`**

In `src/components/features/mobile/mobile-agent-panel.tsx`:

- Remove `useRemoteCodexSources`.
- Remove `TSessionSourceFilter`.
- Remove `sessionSourceFilter` and `sessionSourceIdFilter` state.
- Remove `source` and `sourceId` from `useSessionList()`.
- Remove `remoteSources` and `refetchRemoteSources`.
- Replace:

```typescript
const isRemoteTimeline = Boolean(jsonlPath?.includes('/.codexmux/remote/codex/'));
const isInputVisible = view === 'timeline' && !isRemoteTimeline;
```

with:

```typescript
const isInputVisible = view === 'timeline';
```

- Remove `handleFilterChange`.
- Replace `handleRefreshSessions` with:

```typescript
const handleRefreshSessions = useCallback(async () => {
  await refetchSessions();
}, [refetchSessions]);
```

- Stop passing `sourceFilter`, `sourceIdFilter`, `remoteSources`, and `onFilterChange` to `SessionListView`.

- [ ] **Step 2: Simplify `SessionListView`**

In `src/components/features/workspace/session-list-view.tsx`:

- Remove `dayjs`.
- Change lucide imports to only `Plus`.
- Remove `TooltipProvider`.
- Remove `useRemoteTerminalSources`.
- Remove `getWindowsTerminalLinkTarget`.
- Remove `IRemoteCodexSourceStatus` and `TSessionSourceFilter`.
- Remove props `sourceFilter`, `sourceIdFilter`, `remoteSources`, and `onFilterChange`.
- Remove `remoteTerminals`, `latestRemoteSource`, `windowsTerminalTarget`, `sourceTime`, and `isFilterActive`.
- Delete the Windows terminal button, filter chip row, and Windows source summary block.
- Keep the header with session title, count, and optional new conversation button.
- Use this item key:

```typescript
key={`${session.sessionId}:${session.jsonlPath ?? ''}`}
```

- [ ] **Step 3: Remove remote badge rendering from `SessionListItem`**

In `src/components/features/workspace/session-list-item.tsx`:

- Change the lucide import to only `Loader2`.
- Delete the `session.source === 'remote'` badge block.
- Keep timestamp, first message, turn count, disabled state, and keyboard navigation behavior unchanged.

- [ ] **Step 4: Remove Windows terminal locale messages**

In `messages/en/terminal.json` and `messages/ko/terminal.json`, remove these keys:

```json
"sessionFilterWindows"
"windowsSourceSummary"
"windowsTerminalShort"
"openWindowsTerminal"
"windowsTerminalTitle"
"windowsTerminalNoSource"
"windowsTerminalNoSourceHint"
```

Keep `sessionFilterAll` and `sessionFilterLocal` only if they are still referenced. If the filter row is deleted, remove those two keys as well.

- [ ] **Step 5: Delete remote hooks and link helper**

Delete:

- `src/hooks/use-remote-codex-sources.ts`
- `src/hooks/use-remote-terminal-sources.ts`
- `src/lib/windows-terminal-link.ts`
- `tests/unit/lib/windows-terminal-link.test.ts`

- [ ] **Step 6: Run UI and type-targeted tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/session-list-rendering.test.ts tests/unit/lib/terminal-websocket-url.test.ts
corepack pnpm tsc --noEmit
```

Expected: no references to removed hooks, messages, or Windows terminal link remain.

## Task 4: Remove Remote Terminal WebSocket And Scripts

**Files:**
- Modify: `server.ts`
- Modify: `package.json`
- Modify: `src/lib/terminal-websocket-url.ts`
- Modify: `src/hooks/use-terminal-websocket.ts`
- Delete: `src/lib/remote-terminal-store.ts`
- Delete: `src/lib/remote-terminal-server.ts`
- Delete: `src/types/remote-terminal.ts`
- Delete: `src/components/features/remote-terminal/remote-terminal-page.tsx`
- Delete: `src/pages/windows-terminal.tsx`
- Delete: `src/pages/api/remote/terminal/register.ts`
- Delete: `src/pages/api/remote/terminal/commands.ts`
- Delete: `src/pages/api/remote/terminal/output.ts`
- Delete: `src/pages/api/remote/terminal/sources.ts`
- Delete: `scripts/windows-terminal-bridge.mjs`
- Delete: `scripts/windows-terminal-bridge-lib.mjs`
- Delete: `tests/unit/lib/remote-terminal-store.test.ts`
- Delete: `tests/unit/scripts/windows-terminal-bridge-lib.test.ts`

- [ ] **Step 1: Remove remote terminal WebSocket from the custom server**

In `server.ts`:

- Remove `handleRemoteTerminalConnection` import.
- Remove `/api/remote/terminal` from `WS_PATHS`.
- Remove `remoteTerminalWss` creation and connection handler.
- Remove `remoteTerminalWss` from the return value of `createWsServers()`.
- Remove `remoteTerminalWss` from the `handleWsUpgrade()` parameter destructuring.
- Remove the `else if (url.pathname === '/api/remote/terminal')` branch.

- [ ] **Step 2: Remove package scripts**

In `package.json`, delete:

```json
"smoke:windows-sync": "node scripts/smoke-windows-sync.mjs",
"windows:codex-sync": "node scripts/windows-codex-sync.mjs",
"windows:terminal-bridge": "node scripts/windows-terminal-bridge.mjs"
```

Keep JSON commas valid.

- [ ] **Step 3: Remove remote endpoint support from terminal URL helpers**

In `src/lib/terminal-websocket-url.ts`, change:

```typescript
export type TTerminalWebSocketEndpoint = '/api/terminal' | '/api/v2/terminal';
```

Remove `sourceId` and `terminalId` from the options interface and delete the branch that appends remote terminal query parameters.

In `src/hooks/use-terminal-websocket.ts`, remove `sourceId` and `terminalId` from `IUseTerminalWebSocketOptions`, the options destructuring, and the dependency list.

- [ ] **Step 4: Update terminal URL helper tests**

In `tests/unit/lib/terminal-websocket-url.test.ts`, remove remote endpoint cases and keep coverage for `/api/terminal`, `/api/v2/terminal`, query encoding, stable client IDs, and endpoint resolution.

- [ ] **Step 5: Delete remote terminal files**

Delete the files listed in this task's file list.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/terminal-websocket-url.test.ts
corepack pnpm tsc --noEmit
```

Expected: PASS and no `remote-terminal` imports remain.

## Task 5: Remove Remote Codex Sync API And Scripts

**Files:**
- Delete: `src/lib/remote-codex-store.ts`
- Delete: `src/pages/api/remote/codex/sync.ts`
- Delete: `src/pages/api/remote/codex/sources.ts`
- Delete: `scripts/windows-codex-sync.mjs`
- Delete: `scripts/windows-codex-sync-task.ps1`
- Delete: `scripts/windows-sync-smoke-lib.mjs`
- Delete: `scripts/smoke-windows-sync.mjs`
- Delete: `tests/unit/scripts/windows-sync-smoke-lib.test.ts`
- Modify: `src/lib/path-validation.ts`
- Modify: `src/lib/session-index.ts`

- [ ] **Step 1: Delete remote Codex sync files**

Delete the files listed in this task's file list.

- [ ] **Step 2: Confirm no imports remain**

Run:

```bash
rg -n "remote-codex-store|writeRemoteCodexChunk|listRemoteCodexSources|collectRemoteCodexJsonlFiles|readRemoteCodexSidecar|REMOTE_CODEX_DIR" src tests scripts
```

Expected: no output.

- [ ] **Step 3: Confirm no remote API route files remain**

Run:

```bash
rg --files src/pages/api/remote
```

Expected: no output or `src/pages/api/remote` missing.

- [ ] **Step 4: Run test suite subset**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/session-index.test.ts tests/unit/lib/path-validation.test.ts tests/unit/pages/timeline-sessions.test.ts
```

Expected: PASS.

## Task 6: Documentation And Landing Docs Cleanup

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`
- Modify: `docs/ADR.md`
- Modify: `docs/ARCHITECTURE-LOGIC.md`
- Modify: `docs/STATUS.md`
- Modify: `docs/TMUX.md`
- Modify: `docs/DATA-DIR.md`
- Modify: `docs/TESTING.md`
- Modify: `docs/PERFORMANCE.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/FOLLOW-UP.md`
- Modify: `docs/operations/2026-05-04-release-v0.4.1-handoff.md`
- Delete: `docs/WINDOWS.md`
- Delete: `docs/operations/2026-05-04-windows-terminal-bridge-preflight-handoff.md`
- Modify: `landing-src/docs/**/{architecture,installation,quickstart,troubleshooting,data-directory,session-status}.md`
- Modify: `landing-src/*.njk`

- [ ] **Step 1: Update README platform and storage wording**

In `README.md`:

- Replace Windows companion support statements with “server execution is supported on macOS and Linux.”
- Remove Windows sync and terminal bridge command sections.
- Remove remote endpoint and remote storage bullets.
- Keep official Remote Control comparison if it still describes local tmux session multiplexing.
- Add one storage note: existing `~/.codexmux/remote/codex/` files from removed Windows sync builds are ignored by current codexmux and can be deleted manually.

- [ ] **Step 2: Update internal docs**

In internal docs:

- `docs/README.md`: remove `docs/WINDOWS.md` from the docs map.
- `docs/ADR.md`: record that Windows companion sync and terminal bridge were removed and local macOS/Linux server state is the supported architecture.
- `docs/ARCHITECTURE-LOGIC.md`: remove remote Codex and Windows terminal bridge diagrams, service rows, and session-index remote sidecar logic.
- `docs/STATUS.md`: remove Windows read-only timeline notes.
- `docs/TMUX.md`: remove Windows terminal bridge protocol sections and file map rows.
- `docs/DATA-DIR.md`: remove active remote storage description; add inert leftover cleanup note.
- `docs/TESTING.md`: remove Windows sync and Windows terminal bridge smoke sections.
- `docs/PERFORMANCE.md`: remove remote session performance notes.
- `docs/RUNTIME-V2-PARITY.md`: remove Windows bridge and remote JSONL rows.
- `docs/RUNTIME-V2-CUTOVER.md`: remove Windows remote parity blockers.
- `docs/FOLLOW-UP.md`: remove Windows 실기기 smoke and Scheduled Task follow-ups.
- `docs/operations/2026-05-04-release-v0.4.1-handoff.md`: mark previous Windows artifacts as historical and unsupported in current code.

- [ ] **Step 3: Delete Windows-specific docs**

Delete:

- `docs/WINDOWS.md`
- `docs/operations/2026-05-04-windows-terminal-bridge-preflight-handoff.md`

- [ ] **Step 4: Update landing docs**

In every locale under `landing-src/docs/**`:

- Remove claims that Windows 11 can run a companion sync client.
- Remove `/api/remote/codex/*`, `/api/remote/terminal/*`, `/windows-terminal`, and `windows:*` commands.
- Update installation requirements to macOS/Linux server only.
- Update data-directory pages so `remote/codex/` is not listed as active state.
- Update troubleshooting pages so Windows native server and Windows companion integration are not presented as supported.

In `landing-src/*.njk`, remove FAQ entries or feature bullets that advertise Windows companion sync or terminal bridge.

- [ ] **Step 5: Run docs stale reference checks**

Run:

```bash
rg -n "windows:codex-sync|windows:terminal-bridge|smoke:windows-sync|/api/remote/codex|/api/remote/terminal|/windows-terminal|remote/codex|Windows companion|Windows terminal bridge|Windows client sync" \
  README.md docs landing-src messages package.json server.ts src tests scripts \
  --glob '!docs/superpowers/**' \
  --glob '!docs/operations/2026-05-05-windows-integration-removal-handoff.md'
```

Expected: no output from active docs, code, tests, scripts, package metadata, or landing docs.

- [ ] **Step 6: Build landing docs**

Run:

```bash
corepack pnpm build:landing
```

Expected: PASS.

## Task 7: Final Verification And Handoff

**Files:**
- Create: `docs/operations/2026-05-05-windows-integration-removal-handoff.md`

- [ ] **Step 1: Run full verification**

Run:

```bash
corepack pnpm test
corepack pnpm tsc --noEmit
corepack pnpm build
corepack pnpm build:landing
git diff --check
```

Expected: all commands PASS.

- [ ] **Step 2: Run final stale reference audit**

Run:

```bash
rg -n "remote-codex-store|remote-terminal-store|remote-terminal-server|windows-terminal-link|use-remote-codex-sources|use-remote-terminal-sources|IRemoteCodexSourceStatus|IRemoteTerminal|TSessionSourceFilter|windows:codex-sync|windows:terminal-bridge|smoke:windows-sync|/api/remote/codex|/api/remote/terminal|/windows-terminal" \
  package.json server.ts src tests scripts README.md docs landing-src messages \
  --glob '!docs/superpowers/**' \
  --glob '!docs/operations/2026-05-05-windows-integration-removal-handoff.md'
```

Expected: no output from active docs, code, tests, scripts, package metadata, or landing docs.

- [ ] **Step 3: Write operation handoff**

Create `docs/operations/2026-05-05-windows-integration-removal-handoff.md`:

```markdown
# Windows Integration Removal Handoff

## Release Scope

Removed Windows companion sync, Windows terminal bridge, remote Codex source UI,
remote API routes, package scripts, tests, and active documentation.

## Verification

- `corepack pnpm test`: PASS
- `corepack pnpm tsc --noEmit`: PASS
- `corepack pnpm build`: PASS
- `corepack pnpm build:landing`: PASS
- `git diff --check`: PASS
- stale Windows integration reference audit: PASS

## Audit

Windows integration files, routes, package scripts, and UI affordances are gone.
Existing `~/.codexmux/remote/codex/` files are not deleted and are ignored by the
current app.

## Blockers

None.

## Warnings

None.

## Residual Risk

Operators with old Windows sync data may still have inert files under
`~/.codexmux/remote/codex/`. Manual deletion is optional.

## Current Lifecycle Stage

operate has been entered.

## Next Action

Monitor normal macOS/Linux session list and timeline behavior after deploy.
```

- [ ] **Step 4: Request code review**

Use `superpowers:requesting-code-review` after implementation and verification. Address findings with `superpowers:receiving-code-review` before release summary.

- [ ] **Step 5: Do not commit unless requested**

Run:

```bash
git status --short
```

Expected: working tree shows the implementation changes. Do not run `git commit` or `git push` unless the user explicitly asks.

## Plan Self-Review

- Spec coverage: every approved removal surface has a task.
- Placeholder scan: no unresolved placeholders are present.
- Type consistency: session list inputs no longer include `source` or `sourceId` across API, runtime contracts, worker IPC, hook, and tests.
- Risk coverage: stale persisted remote rows are filtered, remote JSONL paths are rejected, and old remote data is not deleted.

## Plan Engineering Review

### Scope Challenge

The plan touches more than eight files, but that is inherent to removing a
cross-cutting integration rather than adding a new abstraction. Scope is accepted
as-is because the smaller alternatives would leave dead public routes, stale docs,
or hidden remote session types.

### What Already Exists

- `src/lib/session-index.ts` already owns Codex JSONL discovery and persisted
  session list metadata. The plan reuses it and removes only remote merge logic.
- `src/lib/session-list.ts` already wraps session index pagination for agent
  panels. The plan keeps that boundary.
- `src/lib/timeline-server.ts` already subscribes to allowed JSONL files. The
  plan keeps the path validation boundary and narrows allowed paths.
- `server.ts` already centralizes known WebSocket upgrade paths. The plan removes
  only the remote terminal path.
- `SessionListView` and `SessionListItem` already own session history display.
  The plan removes Windows controls and badges without redesigning the list.

### Not In Scope

- Automatic deletion of `~/.codexmux/remote/codex/`, because feature removal
  should not delete user data.
- Compatibility `410 Gone` route handlers, because the request is deletion and
  keeping route files preserves a dead surface.
- Session list redesign, because the product should keep the existing dense
  operational layout.
- Electron or Android platform changes, because those shells connect to the
  local codexmux server and are unrelated to Windows companion support.

### Architecture Review

Issue found and fixed in the plan:

- `[P1] (confidence: 9/10) src/components/features/workspace/session-list-item.tsx — the original plan removed session list filters but missed the per-row remote badge.`

Fix applied: Task 3 now includes `SessionListItem` and explicitly removes the
`session.source === 'remote'` block.

### Code Quality Review

Issue found and fixed in the plan:

- `[P2] (confidence: 8/10) docs/superpowers/plans/2026-05-05-windows-integration-removal.md — stale reference audit would match the new spec and plan documents if it searched all docs.`

Fix applied: Task 6 and Task 7 stale reference commands now exclude
`docs/superpowers/**` and the new operation handoff.

### Test Review

Coverage diagram:

```text
CODE PATHS                                           TEST COVERAGE
src/lib/session-index.ts
  ├── readStoredIndex()
  │   ├── [★★★] local rows load                       session-index.test.ts
  │   └── [★★★] legacy remote rows drop               session-index.test.ts
  ├── refreshSessionIndex()
  │   └── [★★★] local JSONL only, persisted writes     session-index.test.ts
  └── getSessionIndexPage()
      └── [★★] pagination, no source filters           timeline-sessions.test.ts

src/lib/path-validation.ts
  ├── [★★★] local ~/.codex/sessions path allowed       path-validation.test.ts
  └── [★★★] ~/.codexmux/remote/codex path rejected     path-validation.test.ts

src/pages/api/timeline/sessions.ts
  ├── [★★★] agent panels work without tmux session     timeline-sessions.test.ts
  ├── [★★★] stale source query ignored                 timeline-sessions.test.ts
  └── [★★★] non-agent missing tmux still rejected      timeline-sessions.test.ts

runtime v2 timeline list
  ├── [★★] API forwards local-only input               runtime-v2-api.test.ts
  ├── [★★] supervisor forwards worker request          supervisor.test.ts
  └── [★★] IPC validates local-only payload            ipc.test.ts

UI removal
  ├── [★★] session list render mode unchanged          session-list-rendering.test.ts
  └── [★★] typecheck catches removed props/imports     tsc --noEmit

terminal WebSocket helper
  ├── [★★] local endpoint path                         terminal-websocket-url.test.ts
  └── [★★] runtime v2 endpoint path                    terminal-websocket-url.test.ts
```

No critical test gaps remain in the plan. UI removal is mainly covered by
TypeScript because the changed UI does not introduce a new interaction path.

### Failure Modes

| Failure mode | Covered by plan | User result |
| --- | --- | --- |
| Persisted remote row appears after upgrade | `session-index.test.ts` legacy row test | Row is filtered before display |
| Remote JSONL path is opened by stale client state | `path-validation.test.ts` | Timeline rejects the path |
| Stale `source=remote` query reaches session API | `timeline-sessions.test.ts` | API returns local session page |
| Removed remote terminal WebSocket path is requested | server path removal plus build/typecheck | Normal 404/upgrade rejection |
| Docs still advertise removed feature | stale reference audits and landing build | Verification fails before handoff |

Critical gaps flagged: 0.

### Performance Review

No issues found. Removing remote sidecar scans lowers session-index work because
refreshes no longer traverse `~/.codexmux/remote/codex/`.

### Parallelization

Sequential implementation is recommended for code because shared timeline types
sit under most downstream changes.

| Step | Modules touched | Depends on |
| --- | --- | --- |
| Tests and local-only contracts | `tests/`, `src/lib/`, `src/pages/api/`, `src/lib/runtime/` | none |
| UI and terminal route removal | `src/components/`, `src/hooks/`, `src/pages/`, `server.ts`, `scripts/` | local-only contracts |
| Docs and landing cleanup | `README.md`, `docs/`, `landing-src/`, `messages/` | code removal decisions |
| Verification and handoff | all touched modules | code and docs cleanup |

Parallel lanes: none for code. Docs can be edited after code decisions are stable,
but final stale-reference audits require all lanes merged.

### Completion Summary

- Step 0: Scope Challenge — scope accepted as-is.
- Architecture Review: 1 issue found, fixed in plan.
- Code Quality Review: 1 issue found, fixed in plan.
- Test Review: coverage diagram produced, 0 open gaps.
- Performance Review: 0 issues found.
- NOT in scope: written.
- What already exists: written.
- TODOs: 0 items proposed.
- Failure modes: 0 critical gaps.
- Outside voice: skipped.
- Parallelization: sequential code path, docs after code decisions.
- Lake Score: complete removal path selected.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | not run | Not needed for deletion-only maintenance. |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | not run | Planned for post-implementation code review gate. |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clear | 2 issues found and fixed in plan, 0 critical gaps. |
| Design Review | `/plan-design-review` | UI/UX gaps | 1 | clear | score: 9/10 to 10/10, 0 unresolved decisions. |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | not run | Not needed; no onboarding or developer workflow is added. |

- **UNRESOLVED:** 0.
- **VERDICT:** DESIGN + ENG CLEARED, ready to implement.
