# Runtime V2 Timeline WebSocket Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move client-facing `/api/timeline` WebSocket init/append/error/session-changed delivery to Runtime v2 Timeline Worker/Supervisor when `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`.

**Architecture:** Keep `/api/timeline` URL and client message schema stable. Add a focused Runtime v2 WebSocket bridge that owns live subscription delivery in `default` mode, while legacy `timeline-server.ts` remains owner for `off` and client delivery for `shadow`. Keep `timeline:resume` execution on the existing legacy process-safety path in this slice.

**Tech Stack:** TypeScript, Next.js Pages Router custom server, `ws`, Runtime v2 Supervisor/Worker IPC, tmux, Codex JSONL, Vitest, existing smoke scripts.

---

## File Structure

- Create `src/lib/runtime/timeline-ws.ts`
  - Owns Runtime v2 `/api/timeline` WebSocket session lifecycle: subscribe, unsubscribe, append/error fanout, session watcher fanout, cleanup.
  - Accepts dependency injection for tests so unit tests do not need a real tmux process or worker.
- Modify `src/lib/timeline-server.ts`
  - Adds mode routing to call `handleRuntimeTimelineConnection()` only when Runtime v2 timeline live mode is enabled.
  - Exports or delegates a narrow legacy resume handler used by the Runtime v2 bridge.
  - Keeps legacy delivery untouched for `off` and `shadow`.
- Modify `src/lib/runtime/timeline/worker-service.ts`
  - Fills any init metadata gap that blocks client schema compatibility. `sessionStats` can remain optional, but `sessionId`, `totalEntries`, `startByteOffset`, `hasMore`, `jsonlPath`, `summary`, and `meta` must stay compatible.
- Modify `src/lib/runtime/supervisor.ts`
  - Ensures timeline worker exit clears both live and session-watch subscribers.
  - Ensures `unsubscribeTimelineSessionWatch()` is called during bridge cleanup.
- Modify `src/lib/perf-metrics.ts` only if reset helpers are needed for unit tests. Prefer not to change it.
- Create `tests/unit/lib/runtime/timeline-ws.test.ts`
  - Tests mode-independent bridge behavior with a fake WebSocket and fake Supervisor.
- Modify existing focused tests:
  - `tests/unit/lib/runtime/timeline-worker-service.test.ts`
  - `tests/unit/lib/runtime/supervisor.test.ts`
  - `tests/unit/lib/runtime/timeline-mode.test.ts` if mode helper coverage needs a `shouldUseRuntimeTimelineV2Live` assertion.
- Create `scripts/smoke-runtime-v2-timeline-websocket-default.ts`
  - Temp server smoke that proves `/api/timeline` default mode uses Runtime v2 delivery counters.
- Modify `package.json`
  - Add `smoke:runtime-v2:timeline-websocket-default`.
- Modify docs:
  - `docs/TESTING.md`
  - `docs/RUNTIME-V2-CUTOVER.md`
  - `docs/RUNTIME-V2-PARITY.md`
  - `docs/FOLLOW-UP.md`
  - Add `docs/operations/2026-05-05-runtime-v2-timeline-websocket-cutover-handoff.md` after verification.

## Task 1: Runtime Timeline WebSocket Bridge Tests

**Files:**
- Create: `tests/unit/lib/runtime/timeline-ws.test.ts`
- Create: `src/lib/runtime/timeline-ws.ts`

- [ ] **Step 1: Write the failing bridge test file**

Create `tests/unit/lib/runtime/timeline-ws.test.ts` with this initial coverage:

```typescript
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { handleRuntimeTimelineConnection } from '@/lib/runtime/timeline-ws';
import type { IRuntimeSupervisor } from '@/lib/runtime/supervisor';
import type { IRuntimeTimelineLiveAppendEvent, IRuntimeTimelineSessionChangedEvent } from '@/lib/runtime/contracts';

class FakeSocket extends EventEmitter {
  readyState = 1;
  sent: unknown[] = [];
  closed: Array<{ code: number; reason: string }> = [];
  pings = 0;

  send(value: string): void {
    this.sent.push(JSON.parse(value));
  }

  close(code = 1000, reason = ''): void {
    this.readyState = 3;
    this.closed.push({ code, reason });
    this.emit('close');
  }

  ping(): void {
    this.pings += 1;
  }

  receive(value: unknown): void {
    this.emit('message', Buffer.from(JSON.stringify(value)));
  }
}

const createSupervisor = () => {
  let onAppend: ((event: IRuntimeTimelineLiveAppendEvent) => void) | undefined;
  let onError: ((event: { code: string; message: string }) => void) | undefined;
  let onChanged: ((event: IRuntimeTimelineSessionChangedEvent) => void) | undefined;
  const calls: string[] = [];
  const supervisor = {
    subscribeTimelineLive: vi.fn(async (input) => {
      calls.push('subscribe-live');
      onAppend = input.onAppend;
      onError = input.onError;
      return {
        subscriberId: 'sub-live',
        subscribed: true,
        init: {
          type: 'timeline:init',
          entries: [],
          sessionId: 'session-a',
          totalEntries: 0,
          startByteOffset: 0,
          hasMore: false,
          jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
        },
      };
    }),
    unsubscribeTimelineLive: vi.fn(async () => ({ subscriberId: 'sub-live', unsubscribed: true })),
    subscribeTimelineSessionWatch: vi.fn(async (input) => {
      calls.push('subscribe-session-watch');
      onChanged = input.onChanged;
      return { subscriberId: 'sub-watch', subscribed: true };
    }),
    unsubscribeTimelineSessionWatch: vi.fn(async () => ({ subscriberId: 'sub-watch', unsubscribed: true })),
  } as unknown as IRuntimeSupervisor;

  return {
    supervisor,
    calls,
    emitAppend: (event: IRuntimeTimelineLiveAppendEvent) => onAppend?.(event),
    emitError: (event: { code: string; message: string }) => onError?.(event),
    emitChanged: (event: IRuntimeTimelineSessionChangedEvent) => onChanged?.(event),
  };
};

describe('runtime timeline websocket bridge', () => {
  it('delivers init and append through Runtime v2 live subscription', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();

    await handleRuntimeTimelineConnection(ws as never, {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      panePid: 123,
      panelType: 'codex',
      provider: {
        panelType: 'codex',
        isValidSessionId: () => true,
      } as never,
      supervisor: fake.supervisor,
      detectActiveSession: async () => ({
        status: 'running',
        sessionId: 'session-a',
        jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
        pid: 456,
        startedAt: 1,
        cwd: process.env.HOME ?? '',
      }),
      resolveInitialJsonl: async () => ({
        jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
        sessionId: 'session-a',
      }),
      handleResume: vi.fn(),
      updateTabAgentSessionId: vi.fn(),
    });

    expect(ws.sent).toContainEqual(expect.objectContaining({
      type: 'timeline:session-changed',
      newSessionId: 'session-a',
      reason: 'session-waiting',
    }));
    expect(ws.sent).toContainEqual(expect.objectContaining({
      type: 'timeline:init',
      sessionId: 'session-a',
      jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
    }));

    fake.emitAppend({
      subscriberId: 'sub-live',
      jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
      entries: [{ id: 'entry-a', type: 'user-message', timestamp: 1, text: 'hello' }],
    });

    expect(ws.sent).toContainEqual({
      type: 'timeline:append',
      entries: [{ id: 'entry-a', type: 'user-message', timestamp: 1, text: 'hello' }],
    });
  });

  it('unsubscribes live and session watcher subscriptions on close', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();

    await handleRuntimeTimelineConnection(ws as never, {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      panePid: 123,
      panelType: 'codex',
      provider: { panelType: 'codex', isValidSessionId: () => true } as never,
      supervisor: fake.supervisor,
      detectActiveSession: async () => ({
        status: 'running',
        sessionId: 'session-a',
        jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
        pid: 456,
        startedAt: 1,
        cwd: process.env.HOME ?? '',
      }),
      resolveInitialJsonl: async () => ({
        jsonlPath: `${process.env.HOME}/.codex/sessions/session-a.jsonl`,
        sessionId: 'session-a',
      }),
      handleResume: vi.fn(),
      updateTabAgentSessionId: vi.fn(),
    });

    ws.close(1000, 'test close');

    expect(fake.supervisor.unsubscribeTimelineLive).toHaveBeenCalledWith('sub-live');
    expect(fake.supervisor.unsubscribeTimelineSessionWatch).toHaveBeenCalledWith('sub-watch');
  });

  it('keeps timeline resume delegated to the legacy handler', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();
    const handleResume = vi.fn();

    await handleRuntimeTimelineConnection(ws as never, {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      panePid: 123,
      panelType: 'codex',
      provider: { panelType: 'codex', isValidSessionId: () => true } as never,
      supervisor: fake.supervisor,
      detectActiveSession: async () => ({
        status: 'not-running',
        sessionId: null,
        jsonlPath: null,
        pid: null,
        startedAt: null,
        cwd: null,
      }),
      resolveInitialJsonl: async () => null,
      handleResume,
      updateTabAgentSessionId: vi.fn(),
    });

    ws.receive({ type: 'timeline:resume', sessionId: 'session-a', tmuxSession: 'pt-ws-a-pane-b-tab-c' });

    expect(handleResume).toHaveBeenCalledWith({
      sessionId: 'session-a',
      tmuxSession: 'pt-ws-a-pane-b-tab-c',
    });
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-ws.test.ts
```

Expected: FAIL because `src/lib/runtime/timeline-ws.ts` does not exist.

## Task 2: Runtime Timeline WebSocket Bridge Implementation

**Files:**
- Create: `src/lib/runtime/timeline-ws.ts`
- Modify: `tests/unit/lib/runtime/timeline-ws.test.ts`

- [ ] **Step 1: Create the bridge implementation**

Create `src/lib/runtime/timeline-ws.ts` with these exported types and implementation shape:

```typescript
import { WebSocket } from 'ws';
import { recordPerfCounter } from '@/lib/perf-metrics';
import type { IAgentProvider } from '@/lib/providers';
import { getRuntimeSupervisor, type IRuntimeSupervisor } from '@/lib/runtime/supervisor';
import type { IRuntimeTimelineSessionChangedEvent } from '@/lib/runtime/contracts';
import type { ISessionInfo, TTimelineClientMessage, TTimelineServerMessage } from '@/types/timeline';

export interface IResolvedTimelineJsonl {
  jsonlPath: string;
  sessionId: string;
}

export interface IRuntimeTimelineConnectionInput {
  sessionName: string;
  panePid: number;
  panelType: string;
  provider: IAgentProvider;
  supervisor?: IRuntimeSupervisor;
  detectActiveSession?: () => Promise<ISessionInfo>;
  resolveInitialJsonl: (info: ISessionInfo) => Promise<IResolvedTimelineJsonl | null>;
  handleResume: (payload: { sessionId: string; tmuxSession: string }) => Promise<void> | void;
  updateTabAgentSessionId: (sessionId: string) => Promise<void> | void;
}

interface IRuntimeTimelineConnectionState {
  cleaned: boolean;
  liveSubscriberId: string | null;
  sessionWatchSubscriberId: string | null;
  currentJsonlPath: string | null;
}

const HEARTBEAT_INTERVAL = 30_000;
const HEARTBEAT_TIMEOUT = 90_000;

const sendJson = (ws: WebSocket, msg: TTimelineServerMessage): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
};

const closeRetryable = (ws: WebSocket, reason: string): void => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.close(1001, reason);
  }
};

export const handleRuntimeTimelineConnection = async (
  ws: WebSocket,
  input: IRuntimeTimelineConnectionInput,
): Promise<void> => {
  const supervisor = input.supervisor ?? getRuntimeSupervisor();
  const state: IRuntimeTimelineConnectionState = {
    cleaned: false,
    liveSubscriberId: null,
    sessionWatchSubscriberId: null,
    currentJsonlPath: null,
  };
  let lastHeartbeat = Date.now();

  const cleanup = async (): Promise<void> => {
    if (state.cleaned) return;
    state.cleaned = true;
    clearInterval(heartbeatTimer);
    if (state.liveSubscriberId) {
      await supervisor.unsubscribeTimelineLive(state.liveSubscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.live_unsubscribe_error');
      });
      state.liveSubscriberId = null;
    }
    if (state.sessionWatchSubscriberId) {
      await supervisor.unsubscribeTimelineSessionWatch(state.sessionWatchSubscriberId).catch(() => {
        recordPerfCounter('runtime_v2.timeline_ws.default.session_watch_unsubscribe_error');
      });
      state.sessionWatchSubscriberId = null;
    }
  };

  const subscribeLive = async (resolved: IResolvedTimelineJsonl): Promise<void> => {
    if (state.liveSubscriberId) {
      await supervisor.unsubscribeTimelineLive(state.liveSubscriberId).catch(() => undefined);
      state.liveSubscriberId = null;
    }
    state.currentJsonlPath = resolved.jsonlPath;
    const result = await supervisor.subscribeTimelineLive({
      jsonlPath: resolved.jsonlPath,
      sessionName: input.sessionName,
      sessionId: resolved.sessionId,
      panelType: input.panelType,
      onAppend: (event) => {
        recordPerfCounter('runtime_v2.timeline_ws.default.append');
        sendJson(ws, { type: 'timeline:append', entries: event.entries });
      },
      onError: (event) => {
        recordPerfCounter('runtime_v2.timeline_ws.default.error');
        sendJson(ws, { type: 'timeline:error', code: event.code, message: event.message });
      },
    });
    state.liveSubscriberId = result.subscriberId;
    recordPerfCounter('runtime_v2.timeline_ws.default.init');
    sendJson(ws, result.init);
    await input.updateTabAgentSessionId(result.init.sessionId);
  };

  const handleSessionChanged = async (event: IRuntimeTimelineSessionChangedEvent): Promise<void> => {
    const info = event.info;
    if (info.status === 'running' && info.sessionId) {
      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: info.sessionId,
        reason: info.jsonlPath ? 'new-session-started' : 'session-waiting',
      });
      recordPerfCounter('runtime_v2.timeline_ws.default.session_changed');
    }
    const resolved = await input.resolveInitialJsonl(info);
    if (resolved && resolved.jsonlPath !== state.currentJsonlPath) {
      await subscribeLive(resolved);
    }
    if (info.status === 'not-running' && !resolved) {
      sendJson(ws, { type: 'timeline:session-changed', newSessionId: '', reason: 'session-ended' });
    }
  };

  const heartbeatTimer = setInterval(() => {
    if (Date.now() - lastHeartbeat > HEARTBEAT_TIMEOUT) {
      closeRetryable(ws, 'Heartbeat timeout');
      return;
    }
    if (ws.readyState === WebSocket.OPEN) ws.ping();
  }, HEARTBEAT_INTERVAL);

  ws.on('pong', () => {
    lastHeartbeat = Date.now();
  });

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as TTimelineClientMessage;
      if (msg.type === 'timeline:unsubscribe') {
        if (state.liveSubscriberId) {
          await supervisor.unsubscribeTimelineLive(state.liveSubscriberId);
          state.liveSubscriberId = null;
          state.currentJsonlPath = null;
        }
        return;
      }
      if (msg.type === 'timeline:subscribe' && msg.jsonlPath) {
        await subscribeLive({
          jsonlPath: msg.jsonlPath,
          sessionId: '',
        });
        return;
      }
      if (msg.type === 'timeline:resume' && msg.sessionId && msg.tmuxSession) {
        await input.handleResume({ sessionId: msg.sessionId, tmuxSession: msg.tmuxSession });
      }
    } catch {
      recordPerfCounter('runtime_v2.timeline_ws.default.message_error');
    }
  });

  ws.on('close', () => {
    void cleanup();
  });
  ws.on('error', () => {
    void cleanup();
  });

  try {
    const info = await (input.detectActiveSession ?? (() => input.provider.detectActiveSession(input.panePid)))();
    if (state.cleaned) return;
    if (info.status === 'not-installed') {
      sendJson(ws, { type: 'timeline:error', code: 'not-installed', message: `${input.provider.displayName} is not installed` });
      sendJson(ws, { type: 'timeline:init', entries: [], sessionId: '', totalEntries: 0, startByteOffset: 0, hasMore: false });
      return;
    }
    if (info.status === 'running' && info.sessionId) {
      sendJson(ws, {
        type: 'timeline:session-changed',
        newSessionId: info.sessionId,
        reason: info.jsonlPath ? 'session-waiting' : 'session-waiting',
      });
    }
    const resolved = await input.resolveInitialJsonl(info);
    if (resolved) {
      await subscribeLive(resolved);
    } else {
      sendJson(ws, {
        type: 'timeline:init',
        entries: [],
        sessionId: info.sessionId ?? '',
        totalEntries: 0,
        startByteOffset: 0,
        hasMore: false,
        isAgentStarting: info.status === 'starting',
      });
    }
    const watch = await supervisor.subscribeTimelineSessionWatch({
      sessionName: input.sessionName,
      panePid: input.panePid,
      panelType: input.panelType,
      skipInitial: true,
      onChanged: (event) => {
        void handleSessionChanged(event);
      },
    });
    state.sessionWatchSubscriberId = watch.subscriberId;
  } catch (err) {
    recordPerfCounter('runtime_v2.timeline_ws.default.start_error');
    sendJson(ws, {
      type: 'timeline:error',
      code: 'runtime-v2-timeline-start-failed',
      message: err instanceof Error ? err.message : 'Runtime v2 timeline start failed',
    });
    closeRetryable(ws, 'Runtime v2 timeline unavailable');
  }
};
```

This code block is the starting implementation. During implementation, keep TypeScript strictness and replace any mismatch found by the compiler with the existing local type names.

- [ ] **Step 2: Run the bridge tests**

Run:

```bash
corepack pnpm vitest run tests/unit/lib/runtime/timeline-ws.test.ts
```

Expected: PASS after any required TypeScript-aligned adjustments.

- [ ] **Step 3: Commit the bridge foundation**

```bash
git add src/lib/runtime/timeline-ws.ts tests/unit/lib/runtime/timeline-ws.test.ts
git commit -m "Add runtime timeline websocket bridge"
```

## Task 3: Timeline Server Mode Routing Integration

**Files:**
- Modify: `src/lib/timeline-server.ts`
- Modify: `tests/unit/lib/runtime/timeline-ws.test.ts`
- Test: existing smoke commands listed in Task 6

- [ ] **Step 1: Add a mode route branch before legacy connection setup**

In `src/lib/timeline-server.ts`, import the Runtime v2 bridge and live mode helper:

```typescript
import { handleRuntimeTimelineConnection } from '@/lib/runtime/timeline-ws';
import { shouldUseRuntimeTimelineV2Live } from '@/lib/runtime/timeline-mode';
```

Inside `handleTimelineConnection`, after `provider`, `panePid`, and `hintSessionId` are available, route default mode to the bridge:

```typescript
  const hintSessionId = url.searchParams.get('agentSessionId');

  if (shouldUseRuntimeTimelineV2Live()) {
    await handleRuntimeTimelineConnection(ws, {
      sessionName,
      panePid,
      panelType,
      provider,
      resolveInitialJsonl: async (info) => {
        const effectiveSessionId = info.sessionId ?? hintSessionId;
        if (info.jsonlPath) {
          const resolved = await resolveActiveOrLatestJsonl(provider, sessionName, info.jsonlPath, info.sessionId);
          return { jsonlPath: resolved.jsonlPath, sessionId: resolved.sessionId };
        }
        if (effectiveSessionId) {
          const resolved = await resolveStoredOrLatestJsonl(provider, sessionName, effectiveSessionId);
          return resolved ? { jsonlPath: resolved.jsonlPath, sessionId: resolved.sessionId } : null;
        }
        return null;
      },
      handleResume: async (payload) => {
        const bridgeConn: ITimelineConnection = {
          ws,
          sessionName,
          panePid,
          provider,
          heartbeatTimer: setInterval(() => undefined, 60_000),
          lastHeartbeat: Date.now(),
          currentJsonlPath: null,
          cleaned: false,
        };
        clearInterval(bridgeConn.heartbeatTimer);
        await handleResumeMessage(ws, bridgeConn, payload);
      },
      updateTabAgentSessionId: async (sessionId) => {
        if (sessionId) await updateTabAgentSessionId(sessionName, provider, sessionId).catch(() => {});
      },
    });
    return;
  }
```

If this temporary `bridgeConn` shape is too awkward during implementation, extract the resume process-safety code into a small local helper:

```typescript
const handleTimelineResumeRequest = async (
  ws: WebSocket,
  provider: IAgentProvider,
  sessionName: string,
  payload: { sessionId: string; tmuxSession: string },
) => {
  const conn = {
    ws,
    sessionName,
    provider,
    panePid: 0,
    heartbeatTimer: setInterval(() => undefined, 60_000),
    lastHeartbeat: Date.now(),
    currentJsonlPath: null,
    cleaned: false,
  } as ITimelineConnection;
  clearInterval(conn.heartbeatTimer);
  await handleResumeMessage(ws, conn, payload);
};
```

Prefer extracting the helper if it makes the final code clearer.

- [ ] **Step 2: Preserve legacy `off` and `shadow` behavior**

Do not remove any existing legacy code below the v2 branch. `shadow` must still use legacy delivery and `startRuntimeTimelineLiveShadow()` from `subscribeToFile()`.

- [ ] **Step 3: Run focused TypeScript check**

Run:

```bash
corepack pnpm tsc --noEmit
```

Expected: PASS.

- [ ] **Step 4: Commit the routing integration**

```bash
git add src/lib/timeline-server.ts src/lib/runtime/timeline-ws.ts
git commit -m "Route timeline websocket through runtime v2"
```

## Task 4: Worker Init Compatibility And Supervisor Cleanup Coverage

**Files:**
- Modify: `tests/unit/lib/runtime/timeline-worker-service.test.ts`
- Modify: `tests/unit/lib/runtime/supervisor.test.ts`
- Modify if needed: `src/lib/runtime/timeline/worker-service.ts`
- Modify if needed: `src/lib/runtime/supervisor.ts`

- [ ] **Step 1: Add worker init compatibility assertions**

In `tests/unit/lib/runtime/timeline-worker-service.test.ts`, extend the existing live subscribe test to assert the full init boundary:

```typescript
expect(reply.payload).toMatchObject({
  subscriberId: 'tlsub-a',
  subscribed: true,
  init: {
    type: 'timeline:init',
    sessionId: 'session-a',
    totalEntries: 3,
    startByteOffset: expect.any(Number),
    hasMore: false,
    jsonlPath,
    summary: expect.anything(),
    meta: {
      fileSize: expect.any(Number),
      userCount: 1,
      assistantCount: 1,
    },
  },
});
```

If `summary` can validly be `undefined` for the provider fixture, replace `summary: expect.anything()` with:

```typescript
expect((reply.payload as { init: { summary?: unknown } }).init).toHaveProperty('summary');
```

- [ ] **Step 2: Add Supervisor worker-exit cleanup assertion**

In `tests/unit/lib/runtime/supervisor.test.ts`, add a test near the existing timeline live tests:

```typescript
it('clears timeline live and session watcher subscribers when the timeline worker exits', async () => {
  const { storage, terminal, timeline, status } = createWorkers();
  const eventHandlers: Array<(event: IRuntimeEvent) => void> = [];
  let onExit: ((err?: Error) => void) | null = null;
  const supervisor = createRuntimeSupervisorForTest({
    storage,
    terminal,
    timeline,
    status,
    captureTimelineEventHandler: (handler) => eventHandlers.push(handler),
    createTimelineClient: (handlers) => {
      onExit = handlers.onExit;
      return timeline;
    },
  });
  timeline.replies.set('timeline.live-subscribe', {
    subscriberId: 'sub-live',
    subscribed: true,
    init: {
      type: 'timeline:init',
      entries: [],
      sessionId: 'session-a',
      totalEntries: 0,
      startByteOffset: 0,
      hasMore: false,
    },
  });
  timeline.replies.set('timeline.session-watch-subscribe', {
    subscriberId: 'sub-watch',
    subscribed: true,
  });
  const onError = vi.fn();
  const onChanged = vi.fn();

  await supervisor.subscribeTimelineLive({
    jsonlPath: `${os.homedir()}/.codex/sessions/session.jsonl`,
    sessionName: 'pt-ws-a-pane-b-tab-c',
    sessionId: 'session-a',
    panelType: 'codex',
    onError,
  });
  await supervisor.subscribeTimelineSessionWatch({
    sessionName: 'pt-ws-a-pane-b-tab-c',
    panePid: 123,
    panelType: 'codex',
    onChanged,
  });

  onExit?.(new Error('boom'));
  eventHandlers[0]?.(createRuntimeEvent({
    source: 'timeline',
    target: 'supervisor',
    type: 'timeline.session-changed',
    delivery: 'realtime',
    payload: {
      subscriberId: 'sub-watch',
      sessionName: 'pt-ws-a-pane-b-tab-c',
      info: {
        status: 'running',
        sessionId: 'session-b',
        jsonlPath: null,
        pid: 1,
        startedAt: 1,
        cwd: null,
      },
    },
  }));

  expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'timeline-worker-exited' }));
  expect(onChanged).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run focused runtime tests**

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts tests/unit/lib/runtime/timeline-ws.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit compatibility coverage**

```bash
git add tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts src/lib/runtime/timeline/worker-service.ts src/lib/runtime/supervisor.ts
git commit -m "Tighten timeline websocket runtime coverage"
```

## Task 5: Default-owned Timeline WebSocket Smoke

**Files:**
- Create: `scripts/smoke-runtime-v2-timeline-websocket-default.ts`
- Modify: `package.json`
- Modify: `docs/TESTING.md`

- [ ] **Step 1: Create the smoke script**

Create `scripts/smoke-runtime-v2-timeline-websocket-default.ts` by copying the temp-server/auth/tmux helpers from `scripts/smoke-runtime-v2-timeline-session-changed.ts` and using this smoke-specific check:

```typescript
const perf = await jsonRequest<{
  runtime: { counters?: Record<string, number> };
}>(server.baseUrl, '/api/debug/perf', cookie);

const counters = perf.runtime?.counters ?? {};
if ((counters['runtime_v2.timeline_ws.default.init'] ?? 0) < 1) {
  throw new Error('runtime v2 timeline websocket init counter did not increment');
}
if ((counters['runtime_v2.timeline_ws.default.append'] ?? 0) < 1) {
  throw new Error('runtime v2 timeline websocket append counter did not increment');
}
```

The smoke must:

1. Start a temp server with:

```typescript
CODEXMUX_RUNTIME_V2: '1',
CODEXMUX_RUNTIME_STORAGE_V2_MODE: 'off',
CODEXMUX_RUNTIME_TERMINAL_V2_MODE: 'off',
CODEXMUX_RUNTIME_TIMELINE_V2_MODE: 'default',
CODEXMUX_RUNTIME_STATUS_V2_MODE: 'off',
```

2. Create a tmux session whose pane process is detected as Codex.
3. Create an allowed Codex JSONL fixture under `${HOME}/.codex/sessions/YYYY/MM/DD`.
4. Open `/api/timeline?session=<sessionName>&panelType=codex`.
5. Wait for `timeline:init`.
6. Append one user or assistant entry.
7. Wait for `timeline:append`.
8. Assert the perf counters above.
9. Print only count and mode evidence:

```typescript
console.log(JSON.stringify({
  ok: true,
  timelineV2Mode: 'default',
  checks,
  initTotalEntries: init.totalEntries,
  appendEntries: append.entries?.length ?? 0,
  runtimeCounters: {
    init: counters['runtime_v2.timeline_ws.default.init'] ?? 0,
    append: counters['runtime_v2.timeline_ws.default.append'] ?? 0,
  },
}, null, 2));
```

Do not print prompt text, assistant text, cwd, JSONL path, tmux output, auth cookie, or token.

- [ ] **Step 2: Add package script**

In `package.json`, add:

```json
"smoke:runtime-v2:timeline-websocket-default": "tsx scripts/smoke-runtime-v2-timeline-websocket-default.ts"
```

- [ ] **Step 3: Run the new smoke**

Run:

```bash
corepack pnpm smoke:runtime-v2:timeline-websocket-default
```

Expected: PASS with `runtimeCounters.init >= 1` and `runtimeCounters.append >= 1`.

- [ ] **Step 4: Commit the smoke**

```bash
git add scripts/smoke-runtime-v2-timeline-websocket-default.ts package.json docs/TESTING.md
git commit -m "Add timeline websocket default smoke"
```

## Task 6: Existing Timeline And Android Regression Smokes

**Files:**
- No source edits expected.

- [ ] **Step 1: Run timeline shadow/live/resume/session smokes**

Run:

```bash
corepack pnpm smoke:runtime-v2:timeline-live-shadow
corepack pnpm smoke:runtime-v2:timeline-resume-safety
corepack pnpm smoke:runtime-v2:timeline-session-changed
```

Expected: all PASS, with sanitized output only.

- [ ] **Step 2: Run Android timeline foreground smoke**

Run:

```bash
corepack pnpm smoke:android:timeline-foreground
```

Expected:

- `timelineV2Mode=default`
- foreground rounds pass
- blocking console/logcat counts are 0
- `checks` includes `android-restore`
- `restoreState.href` is the configured restore URL

- [ ] **Step 3: Commit only if regression docs need updates**

If no docs changed, do not create a commit for this task. If evidence docs are updated:

```bash
git add docs/operations/2026-05-05-runtime-v2-timeline-websocket-cutover-handoff.md
git commit -m "Record timeline websocket cutover evidence"
```

## Task 7: Documentation And Rollback Handoff

**Files:**
- Modify: `docs/RUNTIME-V2-CUTOVER.md`
- Modify: `docs/RUNTIME-V2-PARITY.md`
- Modify: `docs/FOLLOW-UP.md`
- Modify: `docs/TESTING.md`
- Add: `docs/operations/2026-05-05-runtime-v2-timeline-websocket-cutover-handoff.md`

- [ ] **Step 1: Update cutover docs**

In `docs/RUNTIME-V2-CUTOVER.md`, update Phase 4 current state to say:

```markdown
- 2026-05-05 WebSocket default slice: `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`
  routes client-facing `/api/timeline` WebSocket init/append/error/session-changed delivery
  through Timeline Worker/Supervisor. `timeline:resume` command execution remains on the
  legacy process-safety path. Rollback is `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`.
```

In `docs/RUNTIME-V2-PARITY.md`, update the Timeline `Init/append subscribe/unsubscribe` row gap
from “default WebSocket ownership remain” to “resume command execution remains legacy-owned”.

In `docs/FOLLOW-UP.md`, move Timeline WebSocket default ownership from remaining work to completed
evidence, and keep Status v2 Phase 5 as remaining work.

- [ ] **Step 2: Create handoff**

Create `docs/operations/2026-05-05-runtime-v2-timeline-websocket-cutover-handoff.md`:

```markdown
# Runtime V2 Timeline WebSocket Cutover Handoff

## Scope

Moved client-facing `/api/timeline` WebSocket init/append/error/session-changed delivery to
Runtime v2 Timeline Worker/Supervisor when `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=default`.
`timeline:resume` command execution remains legacy-owned for process-safety rollback.

## Verification

- `corepack pnpm test tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts`
- `corepack pnpm smoke:runtime-v2:timeline-websocket-default`
- `corepack pnpm smoke:runtime-v2:timeline-live-shadow`
- `corepack pnpm smoke:runtime-v2:timeline-resume-safety`
- `corepack pnpm smoke:runtime-v2:timeline-session-changed`
- `corepack pnpm smoke:android:timeline-foreground`
- `corepack pnpm tsc --noEmit`
- `corepack pnpm lint`
- `corepack pnpm build`

## Rollback

Set `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`, reload systemd, and restart `codexmux.service`.
No JSONL, SQLite, tmux session, or Codex state cleanup is required.

## Remaining Work

- Runtime v2 Phase 5 status polling/ack/Web Push/session history ownership.
- Timeline resume command execution ownership can be considered only after separate rollback evidence.
```

- [ ] **Step 3: Run doc and full baseline checks**

Run:

```bash
git diff --check
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
```

Expected: all PASS.

- [ ] **Step 4: Commit docs**

```bash
git add docs/RUNTIME-V2-CUTOVER.md docs/RUNTIME-V2-PARITY.md docs/FOLLOW-UP.md docs/TESTING.md docs/operations/2026-05-05-runtime-v2-timeline-websocket-cutover-handoff.md
git commit -m "Document timeline websocket cutover"
```

## Task 8: Final Verification And Release Readiness

**Files:**
- No planned source edits.

- [ ] **Step 1: Run final command set**

Run:

```bash
corepack pnpm test tests/unit/lib/runtime/timeline-ws.test.ts tests/unit/lib/runtime/timeline-worker-service.test.ts tests/unit/lib/runtime/supervisor.test.ts
corepack pnpm smoke:runtime-v2:timeline-websocket-default
corepack pnpm smoke:runtime-v2:timeline-live-shadow
corepack pnpm smoke:runtime-v2:timeline-resume-safety
corepack pnpm smoke:runtime-v2:timeline-session-changed
corepack pnpm smoke:android:timeline-foreground
corepack pnpm tsc --noEmit
corepack pnpm lint
corepack pnpm build
git status --short --branch
```

Expected:

- All tests and smokes PASS.
- Android smoke restores WebView to the configured restore URL.
- `git status --short --branch` is clean after all implementation commits.

- [ ] **Step 2: Stop before deploy**

Do not deploy, restart systemd, or push unless the user explicitly asks. Report:

- final commit list
- verification commands and outcomes
- whether live `/api/health.commit` still points to an older deploy commit
- rollback flag: `CODEXMUX_RUNTIME_TIMELINE_V2_MODE=off`
