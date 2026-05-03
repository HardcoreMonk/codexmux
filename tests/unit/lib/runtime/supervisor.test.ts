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
  terminal.replies.set('terminal.health', { ok: true });
  terminal.replies.set('terminal.create-session', { sessionName: 'rtv2-ws-a-pane-b-tab-generated' });
  terminal.replies.set('terminal.attach', { sessionName: 'rtv2-ws-a-pane-b-tab-c', attached: true });
  terminal.replies.set('terminal.detach', { sessionName: 'rtv2-ws-a-pane-b-tab-c', detached: true });
  terminal.replies.set('terminal.kill-session', { sessionName: 'rtv2-ws-a-pane-b-tab-c', killed: true });
  terminal.replies.set('terminal.has-session', { sessionName: 'rtv2-ws-a-pane-b-tab-c', exists: true });
  terminal.replies.set('terminal.write-stdin', { written: 4 });
  terminal.replies.set('terminal.resize', { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 80, rows: 24 });
  return { storage, terminal };
};

describe('runtime supervisor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as unknown as { __ptRuntimeSupervisor?: unknown }).__ptRuntimeSupervisor;
    delete (globalThis as unknown as { __ptRuntimeSupervisorStartPromise?: unknown }).__ptRuntimeSupervisorStartPromise;
    delete (globalThis as unknown as { __ptRuntimeSupervisorPreparedDbPath?: unknown }).__ptRuntimeSupervisorPreparedDbPath;
  });

  it('starts both workers once and health waits for both worker health commands', async () => {
    const { storage, terminal } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

    await Promise.all([supervisor.ensureStarted(), supervisor.ensureStarted()]);
    await expect(supervisor.health()).resolves.toEqual({
      ok: true,
      storage: { ok: true },
      terminal: { ok: true },
    });

    expect(storage.started).toBe(1);
    expect(terminal.started).toBe(1);
    expect(storage.ready).toBe(1);
    expect(terminal.ready).toBe(1);
    expect(storage.commands.map((command) => command.type)).toContain('storage.health');
    expect(terminal.commands.map((command) => command.type)).toContain('terminal.health');
  });

  it('deletes workspace using only sessions returned by the storage transaction', async () => {
    const { storage, terminal } = createWorkers();
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
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

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
    const { storage, terminal } = createWorkers();
    storage.replies.set('storage.delete-workspace', { deleted: false, sessions: [{ sessionName: 'rtv2-ws-a-pane-b-tab-a' }] });
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

    await expect(supervisor.deleteWorkspace('ws-a')).resolves.toEqual({
      deleted: false,
      killedSessions: [],
      failedKills: [],
    });
    expect(terminal.commands.map((command) => command.type)).not.toContain('terminal.kill-session');
  });

  it('reconciles stale pending and ready terminal tabs before reporting started', async () => {
    const { storage, terminal } = createWorkers();
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
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

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
    const { storage, terminal } = createWorkers();
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
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

    await supervisor.ensureStarted();

    expect(terminal.commands).toEqual(expect.arrayContaining([
      { type: 'terminal.has-session', payload: { sessionName: 'rtv2-ws-a-pane-b-tab-ready' } },
    ]));
    expect(storage.commands.map((command) => command.type)).not.toContain('storage.fail-ready-terminal-tab');
  });

  it('fails invalid ready terminal tabs without sending invalid tmux targets', async () => {
    const { storage, terminal } = createWorkers();
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
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

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
    const { storage, terminal } = createWorkers();
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
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

    await expect(supervisor.ensureStarted()).rejects.toMatchObject({
      code: 'runtime-v2-terminal-presence-check-failed',
    });

    expect(storage.shutdowns).toBe(1);
    expect(terminal.shutdowns).toBe(1);
    expect(storage.commands.map((command) => command.type)).not.toContain('storage.fail-ready-terminal-tab');
  });

  it('creates terminal tabs with pending storage intent before terminal create and finalization', async () => {
    const { storage, terminal } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

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

  it('rolls back pending tabs and preserves rollback storage failure', async () => {
    const { storage, terminal } = createWorkers();
    terminal.failures.set('terminal.create-session', Object.assign(new Error('tmux create failed'), {
      code: 'runtime-v2-terminal-create-failed',
      retryable: false,
    }));
    storage.failures.set('storage.fail-pending-terminal-tab', Object.assign(new Error('storage rollback failed'), {
      code: 'runtime-v2-pending-tab-not-found',
      retryable: false,
    }));
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

    await expect(supervisor.createTerminalTab({ workspaceId: 'ws-a', paneId: 'pane-b', cwd: '/tmp' })).rejects.toMatchObject({
      code: 'runtime-v2-pending-tab-not-found',
      message: 'storage rollback failed',
    });
    expect(terminal.commands.map((command) => command.type)).toContain('terminal.kill-session');
    expect(storage.commands.map((command) => command.type)).toContain('storage.fail-pending-terminal-tab');
  });

  it('attaches once per session and fans out stdout to every subscriber', async () => {
    const { storage, terminal } = createWorkers();
    const eventHandlers: Array<(event: IRuntimeEvent) => void> = [];
    const supervisor = createRuntimeSupervisorForTest({
      storage,
      terminal,
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

  it('rejects writes from missing subscribers before terminal worker IPC', async () => {
    const { storage, terminal } = createWorkers();
    const supervisor = createRuntimeSupervisorForTest({ storage, terminal });

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
    const { storage, terminal } = createWorkers();

    const supervisor = createRuntimeSupervisorForTest({
      storage,
      terminal,
      dbPath,
      runtimeReset: true,
      useGlobal: true,
    });
    const same = getRuntimeSupervisor();

    await supervisor.ensureStarted();
    expect(same).toBe(supervisor);
    expect(fs.existsSync(`${dbPath}-wal`)).toBe(false);
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.bak'))).toHaveLength(1);
    createRuntimeSupervisorForTest({ storage, terminal, dbPath, runtimeReset: true, useGlobal: true });
    await supervisor.ensureStarted();
    expect(fs.readdirSync(dir).filter((name) => name.endsWith('.bak'))).toHaveLength(1);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
