# Windows Platform Contract Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans`
> to implement this plan task-by-task. Do not use sub-agents unless the user
> explicitly asks for delegated or parallel agent work. Steps use checkbox
> (`- [ ]`) syntax for tracking.

**Goal:** Add the Windows-only platform contract baseline without changing the
browser-facing terminal API or replacing the current tmux runtime.

**Architecture:** Introduce explicit terminal runtime and process inspector
contracts, keep the current tmux/POSIX implementation as the default adapter, add
Windows path fixtures, and add a static scanner for known Windows platform
blockers. `/api/terminal`, `/api/v2/terminal`, Supervisor/Worker IPC, and README
support claims stay unchanged in this slice.

**Tech Stack:** TypeScript, Next.js Pages Router project structure, Vitest,
Node.js `path`/`fs`, existing runtime v2 worker service, existing tmux adapter.

---

## Grill-me Decisions

- First slice success criterion: Windows platform contract baseline only.
- Terminal contract minimum: `createSession`, `attach`, `writeStdin`, `resize`,
  `detach`, `killSession`, `hasSession`, and optional session metadata projection.
- Process inspector contract: general process tree primitives, with Codex-specific
  detection kept outside the OS adapter.
- Test boundary: contract unit tests, current adapter tests, Windows path fixtures,
  and static platform blocker scanner. Live POSIX process inspector tests are
  skipped on Windows until a real Windows process inspector exists. No ConPTY,
  Windows Service, installer, or Electron smoke in this slice.
- Rollback: no feature flag in this slice; existing tmux production path remains
  default and rollback is a normal git revert.

## Plan Design Review

- Information architecture: 8/10 -> 9/10. The plan separates current state,
  Windows target, first implementation slice, and deferred runtime work.
- Gate clarity: 8/10 -> 10/10. Success criteria, excluded items, and rollback are
  explicit.
- Operator error prevention: 8/10 -> 9/10. The plan avoids claiming Windows
  runtime support before implementation and keeps ADR-014's removed companion
  model out of scope.
- Discoverability: 8/10 -> 9/10. The plan points to `docs/WINDOWS-ONLY-GAP-AUDIT.md`,
  ADR-020, and targeted test commands.
- Not in scope: visual UI changes, README Windows-ready copy, ConPTY runtime,
  Windows Service/tray implementation, installer smoke, Android/macOS cleanup.
- What already exists: runtime v2 `ITerminalWorkerRuntime` shape, tmux runtime
  unit tests, session detection helpers, path validation tests, and script helper
  test patterns.

Overall design score: 9/10. Plan is design-complete for a non-UI workflow slice.

---

## File Structure

- Create: `src/lib/runtime/terminal/terminal-runtime-contract.ts`
  Defines the terminal runtime adapter contract and shared result shapes.
- Modify: `src/lib/runtime/terminal/terminal-worker-service.ts`
  Reuses the new contract while preserving the exported
  `ITerminalWorkerRuntime` name for existing callers.
- Modify: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
  Keeps tmux as the default runtime and adds optional metadata projection.
- Modify: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`
  Verifies the current tmux runtime satisfies the contract behavior with mocks.
- Create: `src/lib/process-inspector.ts`
  Defines `IProcessInspector` and hosts the current POSIX/Linux process primitive
  implementation.
- Modify: `src/lib/session-detection.ts`
  Re-exports compatibility helpers from `process-inspector.ts` so current callers
  do not change.
- Create: `tests/unit/lib/process-inspector.test.ts`
  Tests the general process inspector contract on POSIX/Linux and skips the live
  process primitive assertion on Windows.
- Modify: `tests/unit/lib/session-detection.test.ts`
  Keeps compatibility wrapper coverage.
- Modify: `src/lib/path-validation.ts`
  Adds platform-aware path handling and injectable home directory for Windows
  fixtures.
- Modify: `tests/unit/lib/path-validation.test.ts`
  Adds Windows path allow/deny fixtures.
- Create: `scripts/windows-platform-blockers-lib.mjs`
  Static scanner for POSIX-only package/script blockers.
- Create: `tests/unit/scripts/windows-platform-blockers-lib.test.ts`
  Tests blocker detection without failing the build on current known blockers.
- Modify: `docs/WINDOWS-ONLY-GAP-AUDIT.md`
  Adds the accepted first-slice contract baseline summary.

Eng review correction: this slice does not require live Windows process
inspection. Windows gets path/session fixtures and static blocker coverage; the
live process inspector contract remains POSIX-only until the Windows adapter
slice.

---

### Task 1: Terminal Runtime Contract

**Files:**
- Create: `src/lib/runtime/terminal/terminal-runtime-contract.ts`
- Modify: `src/lib/runtime/terminal/terminal-worker-service.ts`
- Test: `tests/unit/lib/runtime/terminal-worker-service.test.ts`

- [ ] **Step 1: Write the failing type import test**

Add this import to `tests/unit/lib/runtime/terminal-worker-service.test.ts`:

```typescript
import type { ITerminalRuntimeAdapter } from '@/lib/runtime/terminal/terminal-runtime-contract';
```

Then update the fake runtime declaration:

```typescript
const createFakeRuntime = (): ITerminalRuntimeAdapter & {
  writes: string[];
  detached: string[];
  pushData?: (data: string) => void;
} => {
```

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-worker-service.test.ts
```

Expected: FAIL because `terminal-runtime-contract.ts` does not exist.

- [ ] **Step 2: Create the terminal runtime contract**

Create `src/lib/runtime/terminal/terminal-runtime-contract.ts`:

```typescript
export interface ITerminalRuntimeCreateInput {
  sessionName: string;
  cols: number;
  rows: number;
  cwd?: string;
}

export interface ITerminalRuntimeSessionRef {
  sessionName: string;
}

export interface ITerminalRuntimeAttachResult extends ITerminalRuntimeSessionRef {
  attached: boolean;
}

export interface ITerminalRuntimeDetachResult extends ITerminalRuntimeSessionRef {
  detached: boolean;
}

export interface ITerminalRuntimeKillResult extends ITerminalRuntimeSessionRef {
  killed: boolean;
}

export interface ITerminalRuntimePresenceResult extends ITerminalRuntimeSessionRef {
  exists: boolean;
}

export interface ITerminalRuntimeWriteResult {
  written: number;
}

export interface ITerminalRuntimeResizeResult extends ITerminalRuntimeSessionRef {
  cols: number;
  rows: number;
}

export interface ITerminalRuntimeSessionInfo extends ITerminalRuntimePresenceResult {
  cwd: string | null;
  command: string | null;
  pid: number | null;
  startedAt: number | null;
  metadataSource: 'terminal-runtime' | 'process-inspector' | 'unavailable';
}

export interface ITerminalRuntimeAdapter {
  health(): Promise<unknown>;
  createSession(input: ITerminalRuntimeCreateInput): Promise<ITerminalRuntimeSessionRef>;
  attach(
    sessionName: string,
    cols: number,
    rows: number,
    onData: (data: string) => void,
  ): Promise<ITerminalRuntimeAttachResult>;
  detach(sessionName: string): Promise<ITerminalRuntimeDetachResult>;
  killSession(sessionName: string): Promise<ITerminalRuntimeKillResult>;
  hasSession(sessionName: string): Promise<ITerminalRuntimePresenceResult>;
  writeStdin(sessionName: string, data: string): Promise<ITerminalRuntimeWriteResult>;
  resize(sessionName: string, cols: number, rows: number): Promise<ITerminalRuntimeResizeResult>;
  getSessionInfo?(sessionName: string): Promise<ITerminalRuntimeSessionInfo>;
}
```

- [ ] **Step 3: Preserve the worker runtime export name**

Modify `src/lib/runtime/terminal/terminal-worker-service.ts` so existing imports
continue to work:

```typescript
import type { ITerminalRuntimeAdapter } from '@/lib/runtime/terminal/terminal-runtime-contract';
```

Replace the local `ITerminalWorkerRuntime` interface with:

```typescript
export type ITerminalWorkerRuntime = ITerminalRuntimeAdapter;
```

Do not change `createTerminalWorkerService` command handling in this task.

- [ ] **Step 4: Verify terminal worker service tests pass**

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-worker-service.test.ts
```

Expected: PASS.

---

### Task 2: Current tmux Runtime Contract Coverage

**Files:**
- Modify: `src/lib/runtime/terminal/terminal-worker-runtime.ts`
- Modify: `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`

- [ ] **Step 1: Make the fake pty emit stdout**

In `tests/unit/lib/runtime/terminal-worker-runtime.test.ts`, replace
`createFakePty` with this shape so contract tests can trigger stdout:

```typescript
const createFakePty = () => {
  let exitHandler: (() => void) | null = null;
  let dataHandler: ((data: string) => void) | null = null;
  return {
    onData: vi.fn((onData: (data: string) => void) => {
      dataHandler = onData;
      return { dispose: vi.fn() };
    }),
    onExit: vi.fn((handler: () => void) => {
      exitHandler = handler;
      return { dispose: vi.fn() };
    }),
    emitData: (data: string) => dataHandler?.(data),
    emitExit: () => exitHandler?.(),
    kill: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
  };
};
```

- [ ] **Step 2: Add failing metadata projection test**

Add this test to `terminal-worker-runtime.test.ts`:

```typescript
it('returns optional terminal runtime metadata for tmux sessions', async () => {
  execFileMock
    .mockImplementationOnce((_cmd, _args, _options, callback) => callback(null, '', ''))
    .mockImplementationOnce((_cmd, _args, _options, callback) => callback(
      null,
      '/work/project\tbash\t4242\t1790000000\n',
      '',
    ));
  const { createTerminalWorkerRuntime } = await import('@/lib/runtime/terminal/terminal-worker-runtime');
  const runtime = createTerminalWorkerRuntime();

  await expect(runtime.getSessionInfo?.('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    exists: true,
    cwd: '/work/project',
    command: 'bash',
    pid: 4242,
    startedAt: 1790000000000,
    metadataSource: 'terminal-runtime',
  });
});
```

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected: FAIL because `getSessionInfo` is not implemented.

- [ ] **Step 3: Implement tmux metadata projection**

In `src/lib/runtime/terminal/terminal-worker-runtime.ts`, add:

```typescript
const parseRuntimeSessionInfo = (sessionName: string, raw: string) => {
  const [cwdRaw, commandRaw, pidRaw, createdRaw] = raw.trimEnd().split('\t');
  const pid = Number.parseInt(pidRaw ?? '', 10);
  const created = Number.parseInt(createdRaw ?? '', 10);
  return {
    sessionName,
    exists: true,
    cwd: cwdRaw || null,
    command: commandRaw || null,
    pid: Number.isFinite(pid) ? pid : null,
    startedAt: Number.isFinite(created) ? created * 1000 : null,
    metadataSource: 'terminal-runtime' as const,
  };
};

const getRuntimeSessionInfo = async (sessionName: string) => {
  assertRuntimeSessionName(sessionName);
  try {
    const { stdout } = await execFile(
      'tmux',
      [
        '-L',
        RUNTIME_TMUX_SOCKET,
        'display-message',
        '-p',
        '-t',
        sessionName,
        '#{pane_current_path}\t#{pane_current_command}\t#{pane_pid}\t#{session_created}',
      ],
      { timeout: CMD_TIMEOUT },
    );
    return parseRuntimeSessionInfo(sessionName, stdout);
  } catch (err) {
    if (isMissingTmuxSessionError(err)) {
      return {
        sessionName,
        exists: false,
        cwd: null,
        command: null,
        pid: null,
        startedAt: null,
        metadataSource: 'unavailable' as const,
      };
    }
    throw createRuntimeError(
      'runtime-v2-terminal-metadata-failed',
      `Runtime v2 tmux session metadata failed: ${sessionName}`,
      err,
    );
  }
};
```

Then add the method to the returned runtime:

```typescript
async getSessionInfo(sessionName) {
  return getRuntimeSessionInfo(sessionName);
},
```

- [ ] **Step 4: Add full current-adapter contract behavior test**

Add this test to `terminal-worker-runtime.test.ts`:

```typescript
it('satisfies the terminal runtime contract with mocked tmux and node-pty', async () => {
  const fakePty = createFakePty();
  ptySpawnMock.mockReturnValue(fakePty);
  const { createTerminalWorkerRuntime } = await import('@/lib/runtime/terminal/terminal-worker-runtime');
  const runtime = createTerminalWorkerRuntime();
  const seen: string[] = [];

  await expect(runtime.createSession({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    cols: 80,
    rows: 24,
    cwd: '/work/project',
  })).resolves.toEqual({ sessionName: 'rtv2-ws-a-pane-b-tab-c' });

  await expect(runtime.attach('rtv2-ws-a-pane-b-tab-c', 80, 24, (data) => {
    seen.push(data);
  })).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    attached: true,
  });

  fakePty.emitData('ready\n');
  await expect(runtime.writeStdin('rtv2-ws-a-pane-b-tab-c', 'pwd\n')).resolves.toEqual({ written: 4 });
  await expect(runtime.resize('rtv2-ws-a-pane-b-tab-c', 100, 30)).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    cols: 100,
    rows: 30,
  });
  await expect(runtime.hasSession('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    exists: true,
  });
  await expect(runtime.detach('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    detached: true,
  });
  await expect(runtime.killSession('rtv2-ws-a-pane-b-tab-c')).resolves.toEqual({
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    killed: true,
  });

  expect(seen).toEqual(['ready\n']);
  expect(fakePty.write).toHaveBeenCalledWith('pwd\n');
  expect(fakePty.resize).toHaveBeenCalledWith(100, 30);
});
```

- [ ] **Step 5: Verify runtime contract tests pass**

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-worker-runtime.test.ts
```

Expected: PASS.

---

### Task 3: Process Inspector Boundary

**Files:**
- Create: `src/lib/process-inspector.ts`
- Modify: `src/lib/session-detection.ts`
- Create: `tests/unit/lib/process-inspector.test.ts`
- Modify: `tests/unit/lib/session-detection.test.ts`

- [ ] **Step 1: Add failing process inspector import test**

Create `tests/unit/lib/process-inspector.test.ts`:

```typescript
import { spawn, type ChildProcess } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { defaultProcessInspector } from '@/lib/process-inspector';

const children: ChildProcess[] = [];

const waitFor = async (predicate: () => Promise<boolean>): Promise<void> => {
  for (let i = 0; i < 30; i++) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('condition was not met before timeout');
};

const spawnIdleNode = (): ChildProcess => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], {
    cwd: process.cwd(),
    stdio: 'ignore',
  });
  children.push(child);
  return child;
};

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.pid && !child.killed) child.kill('SIGKILL');
  }
});

describe('defaultProcessInspector', () => {
  it('reads process primitives without Codex-specific policy', async () => {
    if (process.platform === 'win32') {
      return;
    }

    const child = spawnIdleNode();
    if (!child.pid) throw new Error('spawned child process has no pid');

    await waitFor(async () => (await defaultProcessInspector.getChildren(process.pid)).includes(child.pid!));

    expect(await defaultProcessInspector.isRunning(process.pid)).toBe(true);
    expect(await defaultProcessInspector.getCwd(process.pid)).toBe(process.cwd());
    expect(await defaultProcessInspector.getStartTime(process.pid)).toEqual(expect.any(Number));
    expect(await defaultProcessInspector.getChildren(process.pid)).toContain(child.pid);
    expect(await defaultProcessInspector.getDescendants(process.pid)).toContain(child.pid);
    const command = await defaultProcessInspector.getCommand(child.pid);
    expect(command?.raw).toContain(process.execPath);
  });
});
```

Run:

```bash
corepack pnpm test tests/unit/lib/process-inspector.test.ts
```

Expected: FAIL because `src/lib/process-inspector.ts` does not exist.

The explicit Windows skip is intentional. This slice creates the contract and
keeps current POSIX behavior covered; it does not claim a Windows process
inspector exists yet.

- [ ] **Step 2: Move process primitives into a process inspector module**

Create `src/lib/process-inspector.ts` by moving the process primitive code from
`src/lib/session-detection.ts` into this module. The public shape must include:

```typescript
export interface IProcessCommandLine {
  command: string;
  args: string;
  raw: string;
}

export interface IProcessInspector {
  isRunning(pid: number): Promise<boolean>;
  getChildren(parentPid: number): Promise<number[]>;
  getChildrenOf(parentPids: number[]): Promise<number[]>;
  getDescendants(rootPid: number): Promise<number[]>;
  getCwd(pid: number): Promise<string | null>;
  getCommand(pid: number): Promise<IProcessCommandLine | null>;
  getStartTime(pid: number): Promise<number | null>;
  findDescendants(
    rootPid: number,
    predicate: (pid: number) => Promise<boolean>,
  ): Promise<number[]>;
}
```

The implementation should keep current behavior:

- Linux reads `/proc` for running/cwd/command/start-time.
- Non-Linux fallback remains `ps`, `pgrep`, and `lsof` for now. It is legacy
  current-state behavior, not the accepted Windows implementation.
- `findDescendants` calls `getDescendants` and filters with the async predicate.

Export:

```typescript
export const defaultProcessInspector: IProcessInspector = {
  isRunning,
  getChildren,
  getChildrenOf,
  getDescendants,
  getCwd,
  getCommand,
  getStartTime,
  async findDescendants(rootPid, predicate) {
    const matches: number[] = [];
    for (const pid of await getDescendants(rootPid)) {
      if (await predicate(pid)) matches.push(pid);
    }
    return matches;
  },
};
```

- [ ] **Step 3: Preserve `session-detection.ts` compatibility exports**

Modify `src/lib/session-detection.ts` to import and re-export the primitive
helpers:

```typescript
import {
  defaultProcessInspector,
  type IProcessCommandLine,
} from '@/lib/process-inspector';

export type { IProcessCommandLine } from '@/lib/process-inspector';

export const isProcessRunning = (pid: number): Promise<boolean> =>
  defaultProcessInspector.isRunning(pid);

export const getChildPidsOf = (parentPids: number[]): Promise<number[]> =>
  defaultProcessInspector.getChildrenOf(parentPids);

export const getChildPids = (parentPid: number): Promise<number[]> =>
  defaultProcessInspector.getChildren(parentPid);

export const getDescendantPids = (rootPid: number): Promise<number[]> =>
  defaultProcessInspector.getDescendants(rootPid);

export const getProcessCwd = (pid: number): Promise<string | null> =>
  defaultProcessInspector.getCwd(pid);

export const getProcessCommandLine = (pid: number): Promise<IProcessCommandLine | null> =>
  defaultProcessInspector.getCommand(pid);

export const getProcessStartTime = (pid: number): Promise<number | null> =>
  defaultProcessInspector.getStartTime(pid);
```

Keep `getLatestChildPid` and `ISessionWatcher` in `session-detection.ts` so
existing imports do not move in this slice.

- [ ] **Step 4: Verify process inspector and compatibility tests**

Run:

```bash
corepack pnpm test tests/unit/lib/process-inspector.test.ts tests/unit/lib/session-detection.test.ts
```

Expected: PASS.

On Windows, `process-inspector.test.ts` should pass by skipping the live process
primitive assertion. That skip is removed only in the later Windows process
inspector adapter slice.

---

### Task 4: Windows Path Fixtures

**Files:**
- Modify: `src/lib/path-validation.ts`
- Modify: `tests/unit/lib/path-validation.test.ts`

- [ ] **Step 1: Add failing Windows path fixtures**

Add tests to `tests/unit/lib/path-validation.test.ts`:

```typescript
it('allows Windows Codex session JSONL paths with an injected home directory', async () => {
  const { isAllowedJsonlPath } = await import('@/lib/path-validation');

  expect(isAllowedJsonlPath(
    'C:\\Users\\yohan\\.codex\\sessions\\2026\\05\\06\\session.jsonl',
    { homeDir: 'C:\\Users\\yohan' },
  )).toBe(true);
});

it('rejects Windows sibling directories that only share the sessions prefix', async () => {
  const { isAllowedJsonlPath } = await import('@/lib/path-validation');

  expect(isAllowedJsonlPath(
    'C:\\Users\\yohan\\.codex\\sessions-backup\\session.jsonl',
    { homeDir: 'C:\\Users\\yohan' },
  )).toBe(false);
});

it('rejects Windows legacy remote Codex sidecar paths', async () => {
  const { isAllowedJsonlPath } = await import('@/lib/path-validation');

  expect(isAllowedJsonlPath(
    'C:\\Users\\yohan\\.codexmux\\remote\\codex\\win11\\session.jsonl',
    { homeDir: 'C:\\Users\\yohan' },
  )).toBe(false);
});
```

Run:

```bash
corepack pnpm test tests/unit/lib/path-validation.test.ts
```

Expected: at least one Windows fixture FAILS with the current `path` handling.

- [ ] **Step 2: Add platform-aware path validation**

Replace `src/lib/path-validation.ts` with:

```typescript
import os from 'os';
import path from 'path';

interface IJsonlPathValidationOptions {
  homeDir?: string;
}

const WINDOWS_ABSOLUTE_RE = /^[a-zA-Z]:[\\/]/;

const selectPathApi = (filePath: string, rootPath: string): typeof path.win32 | typeof path =>
  WINDOWS_ABSOLUTE_RE.test(filePath) || WINDOWS_ABSOLUTE_RE.test(rootPath)
    ? path.win32
    : path;

const isPathInside = (filePath: string, rootPath: string): boolean => {
  const pathApi = selectPathApi(filePath, rootPath);
  const resolvedFile = pathApi.resolve(filePath);
  const resolvedRoot = pathApi.resolve(rootPath);
  const relative = pathApi.relative(resolvedRoot, resolvedFile);
  return relative.length > 0 && !relative.startsWith('..') && !pathApi.isAbsolute(relative);
};

export const getCodexSessionsDir = (homeDir = os.homedir()): string => {
  const pathApi = WINDOWS_ABSOLUTE_RE.test(homeDir) ? path.win32 : path;
  return pathApi.join(homeDir, '.codex', 'sessions');
};

export const isAllowedJsonlPath = (
  filePath: string,
  options: IJsonlPathValidationOptions = {},
): boolean => {
  const sessionsDir = getCodexSessionsDir(options.homeDir);
  const pathApi = selectPathApi(filePath, sessionsDir);
  return isPathInside(filePath, sessionsDir) && pathApi.extname(filePath) === '.jsonl';
};
```

- [ ] **Step 3: Verify path tests**

Run:

```bash
corepack pnpm test tests/unit/lib/path-validation.test.ts
```

Expected: PASS.

---

### Task 5: Windows Platform Blocker Scanner

**Files:**
- Create: `scripts/windows-platform-blockers-lib.mjs`
- Create: `tests/unit/scripts/windows-platform-blockers-lib.test.ts`

- [ ] **Step 1: Write failing scanner tests**

Create `tests/unit/scripts/windows-platform-blockers-lib.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';

const loadLib = async () =>
  import(pathToFileURL(path.join(process.cwd(), 'scripts/windows-platform-blockers-lib.mjs')).href);

describe('windows platform blocker scanner', () => {
  it('detects POSIX-only and Linux service script patterns', async () => {
    const { findWindowsPlatformBlockers } = await loadLib();

    expect(findWindowsPlatformBlockers({
      postinstall: 'chmod +x node_modules/.bin/tool',
      prepublishOnly: 'rm -rf dist && next build',
      'deploy:local': 'systemctl --user restart codexmux.service',
      lint: 'eslint',
    })).toEqual([
      { script: 'postinstall', ruleId: 'posix-chmod', severity: 'blocker' },
      { script: 'prepublishOnly', ruleId: 'posix-rm-rf', severity: 'blocker' },
      { script: 'deploy:local', ruleId: 'linux-systemd', severity: 'blocker' },
    ]);
  });

  it('returns an empty list for Windows-safe script examples', async () => {
    const { findWindowsPlatformBlockers } = await loadLib();

    expect(findWindowsPlatformBlockers({
      build: 'next build && node scripts/post-build.js',
      clean: 'node scripts/clean-build-output.mjs',
    })).toEqual([]);
  });
});
```

Run:

```bash
corepack pnpm test tests/unit/scripts/windows-platform-blockers-lib.test.ts
```

Expected: FAIL because the scanner library does not exist.

- [ ] **Step 2: Implement the static scanner**

Create `scripts/windows-platform-blockers-lib.mjs`:

```javascript
export const WINDOWS_PLATFORM_BLOCKER_RULES = [
  {
    id: 'posix-chmod',
    severity: 'blocker',
    pattern: /\bchmod\b/,
  },
  {
    id: 'posix-rm-rf',
    severity: 'blocker',
    pattern: /\brm\s+-rf\b/,
  },
  {
    id: 'linux-systemd',
    severity: 'blocker',
    pattern: /\bsystemctl\b|systemd\s+--user/,
  },
];

export const findWindowsPlatformBlockers = (scripts) => {
  const blockers = [];
  for (const [script, command] of Object.entries(scripts ?? {})) {
    if (typeof command !== 'string') continue;
    for (const rule of WINDOWS_PLATFORM_BLOCKER_RULES) {
      if (!rule.pattern.test(command)) continue;
      blockers.push({
        script,
        ruleId: rule.id,
        severity: rule.severity,
      });
    }
  }
  return blockers;
};
```

- [ ] **Step 3: Verify scanner tests**

Run:

```bash
corepack pnpm test tests/unit/scripts/windows-platform-blockers-lib.test.ts
```

Expected: PASS.

---

### Task 6: Documentation And Verification

**Files:**
- Modify: `docs/WINDOWS-ONLY-GAP-AUDIT.md`
- Verify: all files touched in Tasks 1-5

- [ ] **Step 1: Update audit with accepted first slice**

Append this section to `docs/WINDOWS-ONLY-GAP-AUDIT.md`:

```markdown
## First Implementation Slice

Accepted first slice: Windows platform contract baseline.

Success criteria:

- Terminal runtime contract exists with create, attach, write, resize, detach,
  kill, presence, and optional metadata projection behavior.
- Current tmux runtime remains the default production adapter and passes the new
  mocked contract coverage.
- Process inspector primitives are separated from Codex-specific session
  detection policy.
- Live Windows process inspector behavior is not claimed or required in this
  slice.
- Windows path fixtures cover local Codex session JSONL allow/deny behavior.
- Static package/script blocker scanner identifies POSIX-only and Linux service
  command patterns without changing production scripts.
- Browser-facing terminal APIs and README support claims do not change.

Rollback: normal git revert. No feature flag is needed until runtime selection or
Windows adapter implementation appears in a later slice.
```

- [ ] **Step 2: Run targeted tests**

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/terminal-worker-service.test.ts tests/unit/lib/runtime/terminal-worker-runtime.test.ts tests/unit/lib/process-inspector.test.ts tests/unit/lib/session-detection.test.ts tests/unit/lib/path-validation.test.ts tests/unit/scripts/windows-platform-blockers-lib.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run type and lint checks**

Run:

```bash
corepack pnpm tsc --noEmit
corepack pnpm lint
```

Expected: PASS.

- [ ] **Step 4: Check whitespace**

Run:

```bash
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Prepare handoff without committing**

Because this project says not to commit unless the user explicitly asks, do not
commit in this task. Prepare a summary with:

- files changed,
- targeted test results,
- `tsc` and `lint` results,
- `git diff --check` result,
- whether any Windows blockers remain intentionally recorded for later host
  operations work.

## Self-Review

- Spec coverage: Covers the approved first slice, terminal/process contracts,
  Windows path fixtures, static blocker scan, and rollback behavior.
- 미해결 표식 검사: 남은 임시 marker 없음.
- Type consistency: New interfaces use project naming conventions and preserve
  the existing `ITerminalWorkerRuntime` export name.
- Scope check: No ConPTY implementation, Windows Service, installer, Electron
  smoke, live Windows process inspector, or README Windows-ready copy is included.

## Plan Eng Review

- Architecture review: 1 issue found and fixed. The original live process
  inspector test would have required Windows behavior before a Windows adapter
  exists.
- Code quality review: no additional issues. The plan preserves existing
  compatibility exports and avoids scattering `process.platform` checks through
  production callers.
- Test review: 1 gap corrected. POSIX live process coverage is explicit, while
  Windows coverage is limited to path/session fixtures and static blocker
  scanning in this slice.
- Performance review: no issues. The plan adds contract tests and no new runtime
  polling or hot-path work.
- Failure modes: 0 critical gaps after correction. The only risky failure mode
  was a misleading Windows live process test, now explicitly deferred.
- NOT in scope: written.
- What already exists: written.
- Parallelization: sequential implementation is recommended because the terminal
  contract, process inspector extraction, path fixtures, scanner, and docs all
  touch shared test/type boundaries.
