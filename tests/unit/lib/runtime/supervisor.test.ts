import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeEvent } from '@/lib/runtime/ipc';
import type { IRuntimeEvent } from '@/lib/runtime/ipc';
import { createRuntimeSupervisorForTest, getRuntimeSupervisor } from '@/lib/runtime/supervisor';

class FakeWorker {
  commands: Array<{ type: string; payload: unknown }> = [];
  started = 0;
  ready = 0;
  shutdowns = 0;
  replies = new Map<string, unknown>();
  failures = new Map<string, Error>();

  start = (): void => {
    this.started += 1;
  };

  waitUntilReady = async (): Promise<void> => {
    this.ready += 1;
  };

  shutdown = (): void => {
    this.shutdowns += 1;
  };

  request = async <TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> => {
    this.commands.push({ type, payload });
    const failure = this.failures.get(type);
    if (failure) throw failure;
    return this.replies.get(type) as TResult;
  };
}

const createWorkers = () => {
  const storage = new FakeWorker();
  const terminal = new FakeWorker();
  const timeline = new FakeWorker();
  const status = new FakeWorker();
  storage.replies.set('storage.health', { ok: true });
  storage.replies.set('storage.list-pending-terminal-tabs', []);
  storage.replies.set('storage.list-ready-terminal-tabs', []);
  storage.replies.set('storage.list-workspaces', []);
  storage.replies.set('storage.get-ready-terminal-tab-by-session', {
    id: 'tab-a',
    sessionName: 'rtv2-ws-a-pane-b-tab-c',
    name: '',
    order: 0,
    panelType: 'terminal',
    lifecycleState: 'ready',
  });
  storage.replies.set('storage.create-pending-terminal-tab', { id: 'tab-generated', sessionName: 'rtv2-ws-a-pane-b-tab-generated' });
  storage.replies.set('storage.finalize-terminal-tab', {
    id: 'tab-generated',
    sessionName: 'rtv2-ws-a-pane-b-tab-generated',
    name: '',
    order: 0,
    panelType: 'terminal',
    lifecycleState: 'ready',
  });
  storage.replies.set('storage.fail-pending-terminal-tab', { ok: true });
  storage.replies.set('storage.fail-ready-terminal-tab', { ok: true });
  storage.replies.set('storage.delete-terminal-tab', {
    deleted: true,
    session: { sessionName: 'rtv2-ws-a-pane-b-tab-c' },
  });
  terminal.replies.set('terminal.health', { ok: true });
  terminal.replies.set('terminal.create-session', { sessionName: 'rtv2-ws-a-pane-b-tab-generated' });
  terminal.replies.set('terminal.attach', { sessionName: 'rtv2-ws-a-pane-b-tab-c', attached: true });
  terminal.replies.set('terminal.detach', { sessionName: 'rtv2-ws-a-pane-b-tab-c', detached: true });
  terminal.replies.set('terminal.kill-session', { sessionName: 'rtv2-ws-a-pane-b-tab-c', killed: true });
  terminal.replies.set('terminal.has-session', { sessionName: 'rtv2-ws-a-pane-b-tab-c', exists: true });
  terminal.replies.set('terminal.write-stdin', { written: 4 });
  terminal.replies.set('terminal.resize', { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 });
  timeline.replies.set('timeline.health', { ok: true });
  timeline.replies.set('timeline.list-sessions', { sessions: [], total: 0, hasMore: false });
  timeline.replies.set('timeline.read-entries-before', { entries: [], startByteOffset: 0, hasMore: false });
  timeline.replies.set('timeline.message-counts', { userCount: 0, assistantCount: 0, toolCount: 0, toolBreakdown: {} });
  status.replies.set('status.health', { ok: true });
  status.replies.set('status.reduce-hook-state', { nextState: 'busy', changed: false, deferCodexStop: true });
  status.replies.set('status.reduce-codex-state', { nextState: 'ready-for-review', changed: true, silent: false, skipHistory: false });
  status.replies.set('status.evaluate-notification-policy', {
    processHookEvent: true,
    sendReviewNotification: false,
    sendNeedsInputNotification: true,
  });
  return { storage, terminal, timeline, status };
};

describe('runtime supervisor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as unknown as { __ptRuntimeSupervisor?: unknown }).__ptRuntimeSupervisor;
    delete (globalThis as unknown as { __ptRuntimeSupervisorStartPromise?: unknown }).__ptRuntimeSupervisorStartPromise;
    delete (globalThis as unknown as { __ptRuntimeSupervisorPreparedDbPath?: unknown }).__ptRuntimeSupervisorPreparedDbPath;
  });

  it('starts runtime workers once and health waits for every worker health command', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await Promise.all([supervisor.ensureStarted(), supervisor.ensureStarted()]);
    await expect(supervisor.health()).resolves.toEqual({
      ok: true,
      storage: { ok: true },
      terminal: { ok: true },
      timeline: { ok: true },
      status: { ok: true },
    });

    expect(storage.started).toBe(1);
    expect(terminal.started).toBe(1);
    expect(timeline.started).toBe(1);
    expect(status.started).toBe(1);
    expect(storage.ready).toBe(1);
    expect(terminal.ready).toBe(1);
    expect(timeline.ready).toBe(1);
    expect(status.ready).toBe(1);
    expect(storage.commands.map((command) => command.type)).toContain('storage.health');
    expect(terminal.commands.map((command) => command.type)).toContain('terminal.health');
    expect(timeline.commands.map((command) => command.type)).toContain('timeline.health');
    expect(status.commands.map((command) => command.type)).toContain('status.health');
  });

  it('proxies timeline read commands through the timeline worker', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.listTimelineSessions({
      tmuxSession: 'pt-ws-pane-tab',
      cwd: '/repo',
      panelType: 'codex',
      offset: 10,
      limit: 20,
      source: 'remote',
      sourceId: 'win11',
    })).resolves.toEqual({ sessions: [], total: 0, hasMore: false });
    await expect(supervisor.readTimelineEntriesBefore({
      jsonlPath: `${os.homedir()}/.codex/sessions/session.jsonl`,
      beforeByte: 128,
      limit: 25,
      panelType: 'codex',
    })).resolves.toEqual({ entries: [], startByteOffset: 0, hasMore: false });
    await expect(supervisor.getTimelineMessageCounts(`${os.homedir()}/.codex/sessions/session.jsonl`)).resolves.toEqual({
      userCount: 0,
      assistantCount: 0,
      toolCount: 0,
      toolBreakdown: {},
    });

    expect(timeline.commands).toEqual(expect.arrayContaining([
      {
        type: 'timeline.list-sessions',
        payload: {
          tmuxSession: 'pt-ws-pane-tab',
          cwd: '/repo',
          panelType: 'codex',
          offset: 10,
          limit: 20,
          source: 'remote',
          sourceId: 'win11',
        },
      },
      {
        type: 'timeline.read-entries-before',
        payload: {
          jsonlPath: `${os.homedir()}/.codex/sessions/session.jsonl`,
          beforeByte: 128,
          limit: 25,
          panelType: 'codex',
        },
      },
      {
        type: 'timeline.message-counts',
        payload: { jsonlPath: `${os.homedir()}/.codex/sessions/session.jsonl` },
      },
    ]));
  });

  it('proxies status policy commands through the status worker', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.reduceStatusHookState({
      currentState: 'busy',
      eventName: 'stop',
      providerId: 'codex',
    })).resolves.toEqual({ nextState: 'busy', changed: false, deferCodexStop: true });
    await expect(supervisor.reduceStatusCodexState({
      currentState: 'busy',
      running: true,
      hasJsonlPath: true,
      idle: true,
      hasCompletionSnippet: true,
    })).resolves.toEqual({
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    });
    await expect(supervisor.evaluateStatusNotificationPolicy({
      eventName: 'notification',
      notificationType: 'permission_prompt',
      newState: 'needs-input',
      silent: false,
    })).resolves.toEqual({
      processHookEvent: true,
      sendReviewNotification: false,
      sendNeedsInputNotification: true,
    });

    expect(status.commands).toEqual(expect.arrayContaining([
      {
        type: 'status.reduce-hook-state',
        payload: {
          currentState: 'busy',
          eventName: 'stop',
          providerId: 'codex',
        },
      },
      {
        type: 'status.reduce-codex-state',
        payload: {
          currentState: 'busy',
          running: true,
          hasJsonlPath: true,
          idle: true,
          hasCompletionSnippet: true,
        },
      },
      {
        type: 'status.evaluate-notification-policy',
        payload: {
          eventName: 'notification',
          notificationType: 'permission_prompt',
          newState: 'needs-input',
          silent: false,
        },
      },
    ]));
  });

  it('deletes workspace using only sessions returned by the storage transaction', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.delete-workspace', {
      deleted: true,
      sessions: [
        { sessionName: 'rtv2-ws-a-pane-b-tab-a' },
        { sessionName: 'pt-legacy' },
        { sessionName: 'rtv2-ws-a-pane-b-tab-b' },
      ],
    });
    terminal.failures.set('terminal.kill-session', Object.assign(new Error('tmux kill failed'), {
      code: 'runtime-v2-terminal-kill-failed',
      retryable: false,
    }));
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.deleteWorkspace('ws-a')).resolves.toEqual({
      deleted: true,
      killedSessions: [],
      failedKills: [
        { sessionName: 'rtv2-ws-a-pane-b-tab-a', error: 'tmux kill failed' },
        { sessionName: 'pt-legacy', error: 'invalid runtime session name' },
        { sessionName: 'rtv2-ws-a-pane-b-tab-b', error: 'tmux kill failed' },
      ],
    });

    expect(storage.commands.map((command) => command.type)).toContain('storage.delete-workspace');
    expect(storage.commands.map((command) => command.type)).not.toContain('storage.list-workspace-terminal-sessions');
    expect(terminal.commands.filter((command) => command.type === 'terminal.kill-session')).toHaveLength(2);
  });

  it('does not kill sessions when storage delete reports no deletion', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.delete-workspace', { deleted: false, sessions: [{ sessionName: 'rtv2-ws-a-pane-b-tab-a' }] });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.deleteWorkspace('ws-a')).resolves.toEqual({
      deleted: false,
      killedSessions: [],
      failedKills: [],
    });
    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.kill-session');
  });

  it('deletes terminal tabs, closes subscribers, and kills the returned session', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const close = vi.fn();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    const attached = await supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
      send: vi.fn(),
      close,
    });
    await expect(supervisor.deleteTerminalTab('tab-a')).resolves.toEqual({
      deleted: true,
      killedSession: 'rtv2-ws-a-pane-b-tab-c',
      failedKill: null,
    });

    expect(attached.subscriberId).toMatch(/^sub-/);
    expect(close).toHaveBeenCalledWith(1000, 'Tab deleted');
    expect(storage.commands).toEqual(expect.arrayContaining([
      { type: 'storage.delete-terminal-tab', payload: { id: 'tab-a' } },
    ]));
    expect(terminal.commands).toEqual(expect.arrayContaining([
      { type: 'terminal.kill-session', payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c' } },
    ]));
  });

  it('skips terminal kill when terminal tab delete returns no cleanup session', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.delete-terminal-tab', { deleted: false, session: null });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.deleteTerminalTab('tab-missing')).resolves.toEqual({
      deleted: false,
      killedSession: null,
      failedKill: null,
    });
    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.kill-session');
  });

  it('does not send invalid deleted tab sessions to terminal worker', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.delete-terminal-tab', {
      deleted: true,
      session: { sessionName: 'pt-legacy-session' },
    });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.deleteTerminalTab('tab-a')).resolves.toEqual({
      deleted: true,
      killedSession: null,
      failedKill: {
        sessionName: 'pt-legacy-session',
        error: 'invalid runtime session name',
      },
    });
    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.kill-session');
  });

  it('reconciles stale pending and ready terminal tabs before reporting started', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.list-pending-terminal-tabs', [
      { id: 'tab-pending', sessionName: 'rtv2-ws-a-pane-b-tab-pending' },
    ]);
    storage.replies.set('storage.list-ready-terminal-tabs', [
      {
        id: 'tab-ready',
        sessionName: 'rtv2-ws-a-pane-b-tab-ready',
        name: '',
        order: 0,
        panelType: 'terminal',
        lifecycleState: 'ready',
      },
    ]);
    terminal.replies.set('terminal.has-session', {
      sessionName: 'rtv2-ws-a-pane-b-tab-ready',
      exists: false,
    });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await supervisor.ensureStarted();

    expect(terminal.commands).toEqual(expect.arrayContaining([
      { type: 'terminal.kill-session', payload: { sessionName: 'rtv2-ws-a-pane-b-tab-pending' } },
      { type: 'terminal.has-session', payload: { sessionName: 'rtv2-ws-a-pane-b-tab-ready' } },
    ]));
    expect(storage.commands).toEqual(expect.arrayContaining([
      {
        type: 'storage.fail-pending-terminal-tab',
        payload: {
          id: 'tab-pending',
          reason: 'startup reconciliation',
        },
      },
      {
        type: 'storage.fail-ready-terminal-tab',
        payload: {
          id: 'tab-ready',
          reason: 'startup reconciliation: tmux session missing',
        },
      },
    ]));
    expect(storage.commands.findIndex((command) => command.type === 'storage.fail-pending-terminal-tab'))
      .toBeLessThan(storage.commands.findIndex((command) => command.type === 'storage.list-ready-terminal-tabs'));
  });

  it('leaves ready terminal tabs ready when tmux sessions still exist', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.list-ready-terminal-tabs', [
      {
        id: 'tab-ready',
        sessionName: 'rtv2-ws-a-pane-b-tab-ready',
        name: '',
        order: 0,
        panelType: 'terminal',
        lifecycleState: 'ready',
      },
    ]);
    terminal.replies.set('terminal.has-session', {
      sessionName: 'rtv2-ws-a-pane-b-tab-ready',
      exists: true,
    });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await supervisor.ensureStarted();

    expect(terminal.commands).toEqual(expect.arrayContaining([
      { type: 'terminal.has-session', payload: { sessionName: 'rtv2-ws-a-pane-b-tab-ready' } },
    ]));
    expect(storage.commands.map((command) => command.type)).not.toContain('storage.fail-ready-terminal-tab');
  });

  it('fails invalid ready terminal tabs without sending invalid tmux targets', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.list-ready-terminal-tabs', [
      {
        id: 'tab-invalid-ready',
        sessionName: 'pt-legacy-session',
        name: '',
        order: 0,
        panelType: 'terminal',
        lifecycleState: 'ready',
      },
    ]);
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await supervisor.ensureStarted();

    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.has-session');
    expect(storage.commands).toEqual(expect.arrayContaining([
      {
        type: 'storage.fail-ready-terminal-tab',
        payload: {
          id: 'tab-invalid-ready',
          reason: 'startup reconciliation: invalid session name',
        },
      },
    ]));
  });

  it('does not report started when ready tab reconciliation fails', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    storage.replies.set('storage.list-ready-terminal-tabs', [
      {
        id: 'tab-ready',
        sessionName: 'rtv2-ws-a-pane-b-tab-ready',
        name: '',
        order: 0,
        panelType: 'terminal',
        lifecycleState: 'ready',
      },
    ]);
    terminal.failures.set('terminal.has-session', Object.assign(new Error('tmux unavailable'), {
      code: 'runtime-v2-terminal-presence-check-failed',
      retryable: false,
    }));
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.ensureStarted()).rejects.toMatchObject({
      code: 'runtime-v2-terminal-presence-check-failed',
    });

    expect(storage.shutdowns).toBe(1);
    expect(terminal.shutdowns).toBe(1);
    expect(timeline.shutdowns).toBe(1);
    expect(storage.commands.map((command) => command.type)).not.toContain('storage.fail-ready-terminal-tab');
  });

  it('creates terminal tabs with pending storage intent before terminal create and finalization', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await supervisor.createTerminalTab({ workspaceId: 'ws-a', paneId: 'pane-b', cwd: '/tmp' });

    expect([
      ...storage.commands.map((command) => `storage:${command.type}`),
      ...terminal.commands.map((command) => `terminal:${command.type}`),
    ]).toEqual(expect.arrayContaining([
      'storage:storage.create-pending-terminal-tab',
      'storage:storage.finalize-terminal-tab',
      'terminal:terminal.create-session',
    ]));
    const pending = storage.commands.find((command) => command.type === 'storage.create-pending-terminal-tab');
    expect(pending?.payload).toMatchObject({
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      cwd: '/tmp',
      sessionName: expect.stringMatching(/^rtv2-ws-a-pane-b-tab-/),
    });
    expect(pending?.payload).not.toHaveProperty('callerSessionName');
  });

  it('restarts existing terminal tabs with the same runtime session name', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const sessionName = 'rtv2-ws-a-pane-b-tab-c';
    storage.replies.set('storage.create-pending-terminal-tab', {
      id: 'tab-c',
      sessionName,
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      cwd: '/repo',
      runtimeVersion: 2,
      lifecycleState: 'pending_terminal',
      createdAt: new Date(0).toISOString(),
    });
    storage.replies.set('storage.finalize-terminal-tab', {
      id: 'tab-c',
      sessionName,
      name: '',
      order: 0,
      cwd: '/repo',
      panelType: 'terminal',
      runtimeVersion: 2,
      lifecycleState: 'ready',
    });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    const tab = await supervisor.restartTerminalTab({
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      tabId: 'tab-c',
      sessionName,
      cwd: '/repo',
      ensureWorkspacePane: {
        workspaceName: 'Workspace A',
        defaultCwd: '/repo',
      },
    });

    expect(tab).toMatchObject({ id: 'tab-c', sessionName, runtimeVersion: 2, lifecycleState: 'ready' });
    expect(storage.commands.map((command) => command.type)).toEqual(expect.arrayContaining([
      'storage.ensure-workspace-pane',
      'storage.delete-terminal-tab',
      'storage.create-pending-terminal-tab',
      'storage.finalize-terminal-tab',
    ]));
    expect(storage.commands.find((command) => command.type === 'storage.create-pending-terminal-tab')?.payload)
      .toMatchObject({
        id: 'tab-c',
        workspaceId: 'ws-a',
        paneId: 'pane-b',
        sessionName,
        cwd: '/repo',
      });
    expect(terminal.commands.map((command) => command.type)).toEqual(expect.arrayContaining([
      'terminal.kill-session',
      'terminal.create-session',
    ]));
    expect(terminal.commands.find((command) => command.type === 'terminal.create-session')?.payload)
      .toMatchObject({ sessionName, cwd: '/repo' });
  });

  it('ensures legacy workspace pane mirror before creating opt-in runtime terminal tabs', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await supervisor.createTerminalTab({
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      cwd: '/tmp',
      ensureWorkspacePane: {
        workspaceName: 'Workspace A',
        defaultCwd: '/repo',
      },
    });

    expect(storage.commands.map((command) => command.type)).toEqual(expect.arrayContaining([
      'storage.ensure-workspace-pane',
      'storage.create-pending-terminal-tab',
      'storage.finalize-terminal-tab',
    ]));
    expect(storage.commands.find((command) => command.type === 'storage.ensure-workspace-pane')?.payload).toEqual({
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      name: 'Workspace A',
      defaultCwd: '/repo',
    });
  });

  it('rolls back pending tabs and preserves rollback storage failure', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    terminal.failures.set('terminal.create-session', Object.assign(new Error('tmux create failed'), {
      code: 'runtime-v2-terminal-create-failed',
      retryable: false,
    }));
    storage.failures.set('storage.fail-pending-terminal-tab', Object.assign(new Error('storage rollback failed'), {
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.createTerminalTab({ workspaceId: 'ws-a', paneId: 'pane-b', cwd: '/tmp' })).rejects.toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      message: 'storage rollback failed',
    });
    expect(terminal.commands.map((command) => command.type)).toContain('terminal.kill-session');
    expect(storage.commands.map((command) => command.type)).toContain('storage.fail-pending-terminal-tab');
  });

  it('attaches once per session and fans out stdout to every subscriber', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const eventHandlers: Array<(event: IRuntimeEvent) => void> = [];
    const supervisor = createRuntimeSupervisorForTest({
      storage,
      terminal,
      timeline,
      status,
      captureTerminalEventHandler: (handler) => {
        eventHandlers.push(handler);
      },
    });
    const firstSend = vi.fn();
    const secondSend = vi.fn();

    const first = await supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
      send: firstSend,
      close: vi.fn(),
    });
    const second = await supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 120,
      rows: 40,
      send: secondSend,
      close: vi.fn(),
    });

    expect(first.subscriberId).not.toBe(second.subscriberId);
    expect(terminal.commands.filter((command) => command.type === 'terminal.attach')).toHaveLength(1);
    expect(eventHandlers).toHaveLength(1);
    eventHandlers[0](createRuntimeEvent({
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'hello' },
    }));
    expect(firstSend).toHaveBeenCalledWith('hello');
    expect(secondSend).toHaveBeenCalledWith('hello');

    await supervisor.detachTerminal({ sessionName: 'rtv2-ws-a-pane-b-tab-c', subscriberId: first.subscriberId });
    expect(terminal.commands.filter((command) => command.type === 'terminal.detach')).toHaveLength(0);
    await supervisor.detachTerminal({ sessionName: 'rtv2-ws-a-pane-b-tab-c', subscriberId: second.subscriberId });
    expect(terminal.commands.filter((command) => command.type === 'terminal.detach')).toHaveLength(1);
  });

  it('closes terminal subscribers with a retriable code when the worker exits', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    let onExit = (): void => {};
    const close = vi.fn();
    const supervisor = createRuntimeSupervisorForTest({
      storage,
      timeline,
      status,
      createTerminalClient: (handlers) => {
        onExit = handlers.onExit;
        return terminal;
      },
    });

    await supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
      send: vi.fn(),
      close,
    });
    onExit?.();

    expect(close).toHaveBeenCalledWith(1001, 'Terminal worker exited');
  });

  it('waits for an in-flight detach before reattaching the same session', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    let resolveDetach: (() => void) | null = null;
    terminal.request = async <TPayload, TResult>(type: string, payload: TPayload): Promise<TResult> => {
      terminal.commands.push({ type, payload });
      if (type === 'terminal.detach') {
        await new Promise<void>((resolve) => {
          resolveDetach = resolve;
        });
      }
      return terminal.replies.get(type) as TResult;
    };
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });
    const first = await supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
      send: vi.fn(),
      close: vi.fn(),
    });

    const detachPromise = supervisor.detachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: first.subscriberId,
    });
    const finishDetach = resolveDetach as (() => void) | null;
    expect(finishDetach).not.toBeNull();
    const secondPromise = supervisor.attachTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
      send: vi.fn(),
      close: vi.fn(),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(terminal.commands.filter((command) => command.type === 'terminal.attach')).toHaveLength(1);
    finishDetach?.();
    await detachPromise;
    const second = await secondPromise;

    expect(second.subscriberId).not.toBe(first.subscriberId);
    expect(terminal.commands
      .filter((command) => command.type === 'terminal.attach' || command.type === 'terminal.detach')
      .map((command) => command.type)).toEqual(['terminal.attach', 'terminal.detach', 'terminal.attach']);
  });

  it('rejects writes from missing subscribers before terminal worker IPC', async () => {
    const { storage, terminal, timeline, status } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal, timeline, status });

    await expect(supervisor.writeTerminal({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: 'sub-missing',
      data: 'pwd\n',
    })).rejects.toMatchObject({
      code: 'runtime-v2-terminal-subscriber-not-found',
      retryable: false,
    });
    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.write-stdin');
  });

  it('backs up runtime db files once and keeps the singleton on globalThis', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codexmux-runtime-reset-'));
    const dbPath = path.join(dir, 'state.db');
    fs.writeFileSync(`${dbPath}-wal`, 'wal');
    const { storage, terminal, timeline, status } = createWorkers();

    const supervisor = createRuntimeSupervisorForTest({
      storage,
      terminal,
      timeline,
      status,
      dbPath,
      runtimeReset: true,
      useGlobal: true,
    });
    const same = getRuntimeSupervisor();

    await supervisor.ensureStarted();
    expect(same).toBe(supervisor);
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.bak'))).toHaveLength(1);
    createRuntimeSupervisorForTest({ storage, terminal, timeline, status, dbPath, runtimeReset: true, useGlobal: true });
    await supervisor.ensureStarted();
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.bak'))).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
