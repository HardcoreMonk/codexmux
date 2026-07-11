import { EventEmitter } from 'events';
import type { IncomingMessage } from 'http';
import type * as pty from 'node-pty';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import {
  createInstallServer,
  INSTALL_MAX_BUFFERED_OUTPUT_BYTES,
  INSTALL_MAX_FRAME_BYTES,
  type IInstallServerDependencies,
  type IInstallScheduledTask,
} from '@/lib/install-server';
import type {
  TInstallAuthorizationMode,
  TInstallRequestAuthorization,
  TInstallSetupLeaseState,
} from '@/lib/install-request-auth';
import { MSG_STDIN, encodeResize } from '@/lib/terminal-protocol';

interface IDeferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
}

const deferred = <T>(): IDeferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
};

const flush = async (): Promise<void> => {
  await new Promise<void>((resolve) => setImmediate(resolve));
};

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  bufferedAmount = 0;
  sent: unknown[] = [];
  closed: Array<{ code: number; reason: string }> = [];

  send = vi.fn((data: unknown): void => {
    this.sent.push(data);
  });

  close = vi.fn((code: number, reason: string): void => {
    if (this.readyState === WebSocket.CLOSED) return;
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  });

  remoteClose = (): void => {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  };
}

interface IFakeDisposable extends pty.IDisposable {
  dispose: ReturnType<typeof vi.fn<() => void>>;
}

class FakePty {
  pid: number;
  process = 'fake-shell';
  cols = 80;
  rows = 24;
  writes: string[] = [];
  resizes: Array<{ cols: number; rows: number }> = [];
  dataCallbacks: Array<(data: string) => void> = [];
  exitCallbacks: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  disposables: IFakeDisposable[] = [];

  constructor(pid = 1000) {
    this.pid = pid;
  }

  write = vi.fn((data: string): void => {
    this.writes.push(data);
  });

  resize = vi.fn((cols: number, rows: number): void => {
    this.cols = cols;
    this.rows = rows;
    this.resizes.push({ cols, rows });
  });

  kill = vi.fn();
  destroy = vi.fn();
  pause = vi.fn();
  resume = vi.fn();
  clear = vi.fn();

  onData = vi.fn((callback: (data: string) => void): pty.IDisposable => {
    this.dataCallbacks.push(callback);
    return this.createDisposable();
  });

  onExit = vi.fn((callback: (event: { exitCode: number; signal?: number }) => void): pty.IDisposable => {
    this.exitCallbacks.push(callback);
    return this.createDisposable();
  });

  emitData = (data: string): void => {
    for (const callback of this.dataCallbacks) callback(data);
  };

  emitExit = (): void => {
    for (const callback of this.exitCallbacks) callback({ exitCode: 0, signal: 0 });
  };

  private createDisposable = (): IFakeDisposable => {
    const disposable: IFakeDisposable = { dispose: vi.fn() };
    this.disposables.push(disposable);
    return disposable;
  };
}

interface IFakeScheduledTask {
  name: 'command' | 'lease';
  callback: () => void | Promise<void>;
  delayMs: number;
  canceled: boolean;
  executed: boolean;
  cancel: ReturnType<typeof vi.fn<() => void>>;
}

class FakeScheduler {
  tasks: IFakeScheduledTask[] = [];

  scheduleTask = vi.fn<IInstallServerDependencies['scheduleTask']>((
    name: 'command' | 'lease',
    callback: () => void | Promise<void>,
    delayMs: number,
  ): IInstallScheduledTask => {
    const task: IFakeScheduledTask = {
      name,
      callback,
      delayMs,
      canceled: false,
      executed: false,
      cancel: vi.fn(),
    };
    task.cancel.mockImplementation(() => {
      task.canceled = true;
    });
    this.tasks.push(task);
    return task;
  });

  next = (name: 'command' | 'lease'): IFakeScheduledTask => {
    const task = this.tasks.find((candidate) => (
      candidate.name === name && !candidate.executed && !candidate.canceled
    ));
    if (!task) throw new Error(`No pending ${name} task`);
    return task;
  };

  run = async (task: IFakeScheduledTask, includeCanceled = false): Promise<void> => {
    if (task.executed || (task.canceled && !includeCanceled)) return;
    task.executed = true;
    await task.callback();
    await flush();
  };
}

const authorized = (
  mode: TInstallAuthorizationMode,
): TInstallRequestAuthorization => ({ authorized: true, mode });

const request = (url = '/api/install?command=codex'): IncomingMessage => ({
  url,
  headers: {
    host: 'localhost:8122',
    origin: 'http://localhost:8122',
  },
  rawHeaders: [
    'Host', 'localhost:8122',
    'Origin', 'http://localhost:8122',
  ],
  socket: { remoteAddress: '127.0.0.1' },
} as IncomingMessage);

const context = (
  url = '/api/install?command=codex',
  admittedMode: TInstallAuthorizationMode = 'setup-local',
) => ({
  url: new URL(url, 'http://localhost:8122'),
  admittedMode,
});

const createHarness = ({
  mode = 'setup-local' as TInstallAuthorizationMode,
  platform = 'linux' as NodeJS.Platform,
  ptyProcess = new FakePty(),
} = {}) => {
  const scheduler = new FakeScheduler();
  const authorizeRequest = vi.fn(async () => authorized(mode));
  const checkSetupLease = vi.fn(async (): Promise<TInstallSetupLeaseState> => 'valid');
  const spawnPty = vi.fn<IInstallServerDependencies['spawnPty']>(
    (): pty.IPty | Promise<pty.IPty> => ptyProcess as unknown as pty.IPty,
  );
  const server = createInstallServer({
    authorizeRequest,
    checkSetupLease,
    spawnPty,
    scheduleTask: scheduler.scheduleTask,
    platform,
  });
  return {
    server,
    scheduler,
    authorizeRequest,
    checkSetupLease,
    spawnPty,
    ptyProcess,
  };
};

const start = (
  server: ReturnType<typeof createInstallServer>,
  ws: FakeWebSocket,
  url = '/api/install?command=codex',
  mode: TInstallAuthorizationMode = 'setup-local',
): Promise<void> => server.handleConnection(
  ws as unknown as WebSocket,
  request(url),
  context(url, mode),
);

const expectCloseCode = (ws: FakeWebSocket, code: number): void => {
  expect(ws.closed).toHaveLength(1);
  expect(ws.closed[0]).toMatchObject({ code });
};

describe('install server admission', () => {
  it.each([
    ['missing context', null],
    ['undefined context', undefined],
    ['non-URL context', { url: '/api/install?command=codex', admittedMode: 'setup-local' }],
    ['unknown mode', { url: new URL('http://localhost/api/install?command=codex'), admittedMode: 'unknown' }],
    ['wrong route', { url: new URL('http://localhost/api/terminal?command=codex'), admittedMode: 'setup-local' }],
  ])('rejects %s synchronously before fresh authorization', async (_label, invalidContext) => {
    const { server, authorizeRequest, spawnPty } = createHarness();
    const ws = new FakeWebSocket();

    const handled = server.handleConnection(
      ws as unknown as WebSocket,
      request(),
      invalidContext as never,
    );

    expect(authorizeRequest).not.toHaveBeenCalled();
    await handled;
    expectCloseCode(ws, 1008);
    expect(spawnPty).not.toHaveBeenCalled();
    expect(() => ws.emit('error', new Error('after invalid context'))).not.toThrow();
  });

  it('rejects a failed fresh authorization without spawning', async () => {
    const harness = createHarness();
    harness.authorizeRequest.mockResolvedValue({
      authorized: false,
      statusCode: 401,
      reason: 'install-auth-required',
    });
    const ws = new FakeWebSocket();

    await start(harness.server, ws);

    expectCloseCode(ws, 1008);
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it('rejects a fresh authorization mode that differs from the admitted mode', async () => {
    const harness = createHarness({ mode: 'setup-local' });
    const ws = new FakeWebSocket();

    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    expectCloseCode(ws, 1008);
    expect(harness.checkSetupLease).not.toHaveBeenCalled();
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it.each([
    ['/api/install', 'missing command'],
    ['/api/install?command=codex&command=git', 'duplicate command'],
    ['/api/install?command=unknown', 'unknown command'],
    ['/api/install?command=constructor', 'constructor prototype key'],
    ['/api/install?command=__proto__', '__proto__ prototype key'],
    ['/api/install?command=toString', 'toString prototype key'],
    ['/api/install?command=clt', 'command unavailable on linux'],
  ])('rejects %s (%s) without spawning', async (url) => {
    const harness = createHarness({ platform: 'linux' });
    const ws = new FakeWebSocket();

    await start(harness.server, ws, url);

    expectCloseCode(ws, 1008);
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it('accepts a command only on the platform that owns it', async () => {
    const harness = createHarness({ platform: 'darwin' });
    const ws = new FakeWebSocket();

    await start(harness.server, ws, '/api/install?command=clt');

    expect(ws.closed).toEqual([]);
    expect(harness.spawnPty).toHaveBeenCalledTimes(1);
  });

  it('does not reserve or spawn if the socket closes during reauthorization', async () => {
    const auth = deferred<TInstallRequestAuthorization>();
    const harness = createHarness();
    harness.authorizeRequest.mockReturnValue(auth.promise);
    const ws = new FakeWebSocket();

    const handled = start(harness.server, ws);
    expect(harness.authorizeRequest).toHaveBeenCalledTimes(1);
    ws.remoteClose();
    auth.resolve(authorized('setup-local'));
    await handled;

    expect(harness.checkSetupLease).not.toHaveBeenCalled();
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it.each([
    ['oversized frame', [Buffer.alloc(INSTALL_MAX_FRAME_BYTES + 1)], 1009],
    ['frame-count overflow', Array.from({ length: 257 }, () => Buffer.from([MSG_STDIN, 0x78])), 1011],
  ])('guards %s before deferred reauthorization completes', async (_label, frames, code) => {
    const auth = deferred<TInstallRequestAuthorization>();
    const harness = createHarness({ mode: 'authenticated' });
    harness.authorizeRequest.mockReturnValue(auth.promise);
    const ws = new FakeWebSocket();

    const handled = start(
      harness.server,
      ws,
      '/api/install?command=codex',
      'authenticated',
    );
    for (const frame of frames) ws.emit('message', frame);
    expectCloseCode(ws, code);
    auth.resolve(authorized('authenticated'));
    await handled;

    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it('preserves valid input queued before reauthorization completes', async () => {
    const auth = deferred<TInstallRequestAuthorization>();
    const harness = createHarness({ mode: 'authenticated' });
    harness.authorizeRequest.mockReturnValue(auth.promise);
    const ws = new FakeWebSocket();

    const handled = start(
      harness.server,
      ws,
      '/api/install?command=codex',
      'authenticated',
    );
    ws.emit('message', Buffer.from([MSG_STDIN, 0x78]));
    auth.resolve(authorized('authenticated'));
    await handled;
    await flush();

    expect(harness.ptyProcess.write).toHaveBeenCalledWith('x');
  });
});

describe('install server atomic execution slot', () => {
  it('reserves starting before deferred spawn and closes only the competing socket', async () => {
    const firstSpawn = deferred<pty.IPty>();
    const firstPty = new FakePty(1001);
    const harness = createHarness();
    harness.spawnPty.mockReturnValue(firstSpawn.promise);
    const firstWs = new FakeWebSocket();
    const secondWs = new FakeWebSocket();

    const firstHandled = start(harness.server, firstWs);
    await flush();
    await start(harness.server, secondWs);

    expectCloseCode(secondWs, 1013);
    expect(firstWs.closed).toEqual([]);
    expect(harness.spawnPty).toHaveBeenCalledTimes(1);
    firstSpawn.resolve(firstPty as unknown as pty.IPty);
    await firstHandled;
    expect(firstPty.destroy).not.toHaveBeenCalled();
  });

  it('releases a closed starter so a second socket can own the slot and destroys only the late PTY', async () => {
    const lateSpawn = deferred<pty.IPty>();
    const latePty = new FakePty(1001);
    const secondPty = new FakePty(1002);
    const harness = createHarness();
    harness.spawnPty
      .mockReturnValueOnce(lateSpawn.promise)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const firstWs = new FakeWebSocket();
    const secondWs = new FakeWebSocket();

    const firstHandled = start(harness.server, firstWs);
    await flush();
    firstWs.remoteClose();
    await start(harness.server, secondWs);
    lateSpawn.resolve(latePty as unknown as pty.IPty);
    await firstHandled;

    expect(harness.spawnPty).toHaveBeenCalledTimes(2);
    expect(latePty.destroy).toHaveBeenCalledTimes(1);
    expect(secondPty.destroy).not.toHaveBeenCalled();
    expect(secondWs.closed).toEqual([]);
  });

  it('returns the slot to idle after spawn rejection', async () => {
    const secondPty = new FakePty(1002);
    const harness = createHarness();
    harness.spawnPty
      .mockRejectedValueOnce(new Error('spawn failed'))
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const firstWs = new FakeWebSocket();
    const secondWs = new FakeWebSocket();

    await start(harness.server, firstWs);
    await start(harness.server, secondWs);

    expectCloseCode(firstWs, 1011);
    expect(secondWs.closed).toEqual([]);
    expect(harness.spawnPty).toHaveBeenCalledTimes(2);
  });

  it('closes an active-slot competitor without touching the current PTY', async () => {
    const harness = createHarness();
    const ownerWs = new FakeWebSocket();
    const competitorWs = new FakeWebSocket();

    await start(harness.server, ownerWs);
    await start(harness.server, competitorWs);

    expectCloseCode(competitorWs, 1013);
    expect(ownerWs.closed).toEqual([]);
    expect(harness.ptyProcess.destroy).not.toHaveBeenCalled();
  });

  it('ignores stale exit and timer callbacks from an old owner', async () => {
    const firstPty = new FakePty(1001);
    const secondPty = new FakePty(1002);
    const harness = createHarness({ ptyProcess: firstPty });
    harness.spawnPty
      .mockReturnValueOnce(firstPty as unknown as pty.IPty)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const firstWs = new FakeWebSocket();
    await start(harness.server, firstWs);
    const staleCommand = harness.scheduler.next('command');
    const staleExit = firstPty.exitCallbacks[0];

    firstWs.remoteClose();
    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs);
    await harness.scheduler.run(staleCommand, true);
    staleExit({ exitCode: 0, signal: 0 });

    expect(secondWs.closed).toEqual([]);
    expect(secondPty.destroy).not.toHaveBeenCalled();
    const thirdWs = new FakeWebSocket();
    await start(harness.server, thirdWs);
    expectCloseCode(thirdWs, 1013);
  });

  it('rejects new admissions during shutdown and destroys only a late spawned PTY', async () => {
    const pendingSpawn = deferred<pty.IPty>();
    const latePty = new FakePty(1001);
    const harness = createHarness();
    harness.spawnPty.mockReturnValue(pendingSpawn.promise);
    const firstWs = new FakeWebSocket();
    const firstHandled = start(harness.server, firstWs);
    await flush();

    harness.server.shutdown();
    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs);
    pendingSpawn.resolve(latePty as unknown as pty.IPty);
    await firstHandled;
    harness.server.shutdown();

    expectCloseCode(firstWs, 1001);
    expectCloseCode(secondWs, 1013);
    expect(harness.spawnPty).toHaveBeenCalledTimes(1);
    expect(latePty.destroy).toHaveBeenCalledTimes(1);
  });

  it('makes shutdown idempotent for an active owner', async () => {
    const harness = createHarness();
    const ws = new FakeWebSocket();
    await start(harness.server, ws);
    const tasks = [...harness.scheduler.tasks];

    harness.server.shutdown();
    harness.server.shutdown();
    ws.emit('error', new Error('post-shutdown error'));
    harness.ptyProcess.emitExit();

    expectCloseCode(ws, 1001);
    expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
    for (const disposable of harness.ptyProcess.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
    for (const task of tasks) {
      expect(task.cancel).toHaveBeenCalledTimes(1);
    }
  });

  it('performs owner cleanup before closing on a top-level handler error', async () => {
    const events: string[] = [];
    const harness = createHarness();
    harness.ptyProcess.destroy.mockImplementation(() => {
      events.push('destroy');
    });
    harness.scheduler.scheduleTask.mockImplementation(() => {
      throw new Error('scheduler failed');
    });
    const ws = new FakeWebSocket();
    ws.close.mockImplementation((code: number, reason: string) => {
      events.push('close');
      ws.closed.push({ code, reason });
      ws.readyState = WebSocket.CLOSED;
      ws.emit('close');
    });

    await start(harness.server, ws);

    expectCloseCode(ws, 1011);
    expect(events).toEqual(['destroy', 'close']);
  });

  it('cleans the owner when the delayed command write throws', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');
    harness.ptyProcess.write.mockImplementation(() => {
      throw new Error('write failed');
    });

    await harness.scheduler.run(harness.scheduler.next('command'));

    expectCloseCode(ws, 1011);
    expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
  });

  it('releases the slot and owned resources when the PTY exits first', async () => {
    const firstPty = new FakePty(1001);
    const secondPty = new FakePty(1002);
    const harness = createHarness({ mode: 'authenticated', ptyProcess: firstPty });
    harness.spawnPty
      .mockReturnValueOnce(firstPty as unknown as pty.IPty)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const firstWs = new FakeWebSocket();
    await start(harness.server, firstWs, '/api/install?command=codex', 'authenticated');
    const firstTasks = [...harness.scheduler.tasks];

    firstPty.emitExit();

    expectCloseCode(firstWs, 1000);
    expect(firstPty.destroy).not.toHaveBeenCalled();
    for (const disposable of firstPty.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
    for (const task of firstTasks) expect(task.cancel).toHaveBeenCalledTimes(1);

    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs, '/api/install?command=codex', 'authenticated');
    expect(secondWs.closed).toEqual([]);
    expect(secondPty.destroy).not.toHaveBeenCalled();
  });

  it('falls back to kill when a PTY has no destroy method', async () => {
    const ptyProcess = new FakePty();
    delete (ptyProcess as unknown as { destroy?: unknown }).destroy;
    const harness = createHarness({ mode: 'authenticated', ptyProcess });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    ws.remoteClose();

    expect(ptyProcess.kill).toHaveBeenCalledTimes(1);
  });
});

describe('install server setup lease', () => {
  it.each([
    ['completed' as const, 1000],
    ['unavailable' as const, 1011],
  ])('closes when the pre-spawn lease is %s (code %i)', async (lease, code) => {
    const harness = createHarness();
    harness.checkSetupLease.mockResolvedValue(lease);
    const ws = new FakeWebSocket();

    await start(harness.server, ws);

    expectCloseCode(ws, code);
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it.each([
    ['completed' as const, 1000],
    ['unavailable' as const, 1011],
  ])('destroys a deferred PTY if the post-spawn lease becomes %s', async (lease, code) => {
    const spawned = deferred<pty.IPty>();
    const latePty = new FakePty();
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce(lease);
    harness.spawnPty.mockReturnValue(spawned.promise);
    const ws = new FakeWebSocket();

    const handled = start(harness.server, ws);
    await flush();
    spawned.resolve(latePty as unknown as pty.IPty);
    await handled;

    expectCloseCode(ws, code);
    expect(latePty.destroy).toHaveBeenCalledTimes(1);
    expect(harness.scheduler.scheduleTask).not.toHaveBeenCalled();
  });

  it.each(['close', 'shutdown'] as const)(
    'destroys a spawned PTY immediately when %s occurs during the post-spawn lease check',
    async (action) => {
      const postSpawnLease = deferred<TInstallSetupLeaseState>();
      const harness = createHarness();
      harness.checkSetupLease
        .mockResolvedValueOnce('valid')
        .mockReturnValueOnce(postSpawnLease.promise);
      const ws = new FakeWebSocket();

      const handled = start(harness.server, ws);
      await flush();
      if (action === 'close') ws.remoteClose();
      else harness.server.shutdown();

      expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
      postSpawnLease.resolve('valid');
      await handled;
      expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
    },
  );

  it('does not activate a PTY that exits during the post-spawn lease check', async () => {
    const postSpawnLease = deferred<TInstallSetupLeaseState>();
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockReturnValueOnce(postSpawnLease.promise);
    const ws = new FakeWebSocket();

    const handled = start(harness.server, ws);
    await flush();
    harness.ptyProcess.emitExit();
    postSpawnLease.resolve('valid');
    await handled;

    expectCloseCode(ws, 1000);
    expect(harness.scheduler.scheduleTask).not.toHaveBeenCalled();
  });

  it.each([
    ['completed' as const, 1000],
    ['unavailable' as const, 1011],
  ])('rechecks a %s lease before the delayed command write', async (lease, code) => {
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce(lease);
    const ws = new FakeWebSocket();
    await start(harness.server, ws);
    const command = harness.scheduler.next('command');

    expect(command.delayMs).toBe(300);
    await harness.scheduler.run(command);

    expectCloseCode(ws, code);
    expect(harness.ptyProcess.write).not.toHaveBeenCalled();
  });

  it.each([
    ['stdin', 'completed' as const, 1000],
    ['stdin', 'unavailable' as const, 1011],
    ['resize', 'completed' as const, 1000],
    ['resize', 'unavailable' as const, 1011],
  ])('rechecks the lease before %s when state is %s', async (kind, lease, code) => {
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce(lease);
    const ws = new FakeWebSocket();
    await start(harness.server, ws);

    ws.emit('message', kind === 'stdin' ? Buffer.from([MSG_STDIN, 0x78]) : encodeResize(120, 40));
    await flush();

    expectCloseCode(ws, code);
    expect(harness.ptyProcess.write).not.toHaveBeenCalled();
    expect(harness.ptyProcess.resize).not.toHaveBeenCalled();
  });

  it('uses a cancelable recursive one-shot lease watcher', async () => {
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('completed');
    const ws = new FakeWebSocket();
    await start(harness.server, ws);

    const firstWatch = harness.scheduler.next('lease');
    await harness.scheduler.run(firstWatch);
    const secondWatch = harness.scheduler.next('lease');
    expect(secondWatch).not.toBe(firstWatch);
    await harness.scheduler.run(secondWatch);

    expectCloseCode(ws, 1000);
    expect(harness.scheduler.tasks.filter((task) => task.name === 'lease')).toHaveLength(2);
  });

  it('does not overlap recursive lease watcher checks', async () => {
    const pendingLease = deferred<TInstallSetupLeaseState>();
    const harness = createHarness();
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockReturnValueOnce(pendingLease.promise);
    const ws = new FakeWebSocket();
    await start(harness.server, ws);
    const firstWatch = harness.scheduler.next('lease');

    const running = harness.scheduler.run(firstWatch);
    await flush();
    expect(firstWatch.delayMs).toBe(500);
    expect(harness.scheduler.tasks.filter((task) => task.name === 'lease')).toHaveLength(1);

    pendingLease.resolve('valid');
    await running;
    expect(harness.scheduler.tasks.filter((task) => task.name === 'lease')).toHaveLength(2);
  });

  it('prevents a stale pending input lease from reaching a new owner', async () => {
    const inputLease = deferred<TInstallSetupLeaseState>();
    const firstPty = new FakePty(1001);
    const secondPty = new FakePty(1002);
    const harness = createHarness({ ptyProcess: firstPty });
    harness.spawnPty
      .mockReturnValueOnce(firstPty as unknown as pty.IPty)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    harness.checkSetupLease
      .mockResolvedValueOnce('valid')
      .mockResolvedValueOnce('valid')
      .mockReturnValueOnce(inputLease.promise)
      .mockResolvedValue('valid');
    const firstWs = new FakeWebSocket();
    await start(harness.server, firstWs);

    firstWs.emit('message', Buffer.from([MSG_STDIN, 0x78]));
    await flush();
    firstWs.remoteClose();
    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs);
    inputLease.resolve('valid');
    await flush();

    expect(firstPty.write).not.toHaveBeenCalled();
    expect(secondPty.write).not.toHaveBeenCalled();
    expect(secondWs.closed).toEqual([]);
    const competitor = new FakeWebSocket();
    await start(harness.server, competitor);
    expectCloseCode(competitor, 1013);
  });

  it.each([
    ['completed' as const, 1000],
    ['unavailable' as const, 1011],
    ['valid' as const, 1008],
  ])('maps setup-local reauthorization drift with a %s lease to %i', async (lease, code) => {
    const harness = createHarness({ mode: 'authenticated' });
    harness.checkSetupLease.mockResolvedValue(lease);
    const ws = new FakeWebSocket();

    await start(harness.server, ws, '/api/install?command=codex', 'setup-local');

    expectCloseCode(ws, code);
    expect(harness.checkSetupLease).toHaveBeenCalledTimes(1);
    expect(harness.spawnPty).not.toHaveBeenCalled();
  });

  it('cleans an active setup connection only once across close, error, exit, and shutdown', async () => {
    const harness = createHarness();
    const ws = new FakeWebSocket();
    await start(harness.server, ws);
    const exitCallback = harness.ptyProcess.exitCallbacks[0];
    const tasks = [...harness.scheduler.tasks];

    ws.remoteClose();
    expect(() => ws.emit('error', new Error('after close'))).not.toThrow();
    exitCallback({ exitCode: 0, signal: 0 });
    harness.server.shutdown();
    harness.server.shutdown();

    expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
    for (const disposable of harness.ptyProcess.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
    for (const task of tasks) {
      expect(task.cancel).toHaveBeenCalledTimes(1);
    }
  });
});

describe('install server dimensions and bounded input queue', () => {
  it('closes output backpressure before sending or retaining the owner', async () => {
    const secondPty = new FakePty(1002);
    const harness = createHarness({ mode: 'authenticated' });
    harness.spawnPty.mockReturnValueOnce(harness.ptyProcess as unknown as pty.IPty)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');
    ws.bufferedAmount = INSTALL_MAX_BUFFERED_OUTPUT_BYTES;

    harness.ptyProcess.emitData('x');

    expectCloseCode(ws, 1011);
    expect(ws.send).not.toHaveBeenCalled();
    expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);

    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs, '/api/install?command=codex', 'authenticated');
    expect(secondWs.closed).toEqual([]);
  });

  it('does not run setup lease checks for authenticated command and input', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    const command = harness.scheduler.next('command');
    await harness.scheduler.run(command);
    ws.emit('message', Buffer.from([MSG_STDIN, 0x78]));
    await flush();

    expect(harness.checkSetupLease).not.toHaveBeenCalled();
    expect(harness.scheduler.tasks.filter((task) => task.name === 'lease')).toEqual([]);
    expect(harness.ptyProcess.write).toHaveBeenCalledTimes(2);
  });

  it('exports the WebSocket payload boundary and clamps initial dimensions', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();

    await start(
      harness.server,
      ws,
      '/api/install?command=codex&cols=65535&rows=65535',
      'authenticated',
    );

    expect(INSTALL_MAX_FRAME_BYTES).toBe(64 * 1024);
    expect(harness.spawnPty).toHaveBeenCalledTimes(1);
    expect(harness.spawnPty.mock.calls[0][2]).toMatchObject({ cols: 500, rows: 200 });
  });

  it('clamps binary resize independently of the initial query', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex&cols=90&rows=30', 'authenticated');

    ws.emit('message', encodeResize(65535, 65535));
    await flush();

    expect(harness.ptyProcess.resize).toHaveBeenCalledWith(500, 200);
    expect(harness.spawnPty.mock.calls[0][2]).toMatchObject({ cols: 90, rows: 30 });
  });

  it('accepts exactly 65,536 message bytes', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');
    const frame = Buffer.alloc(INSTALL_MAX_FRAME_BYTES, 0x78);
    frame[0] = MSG_STDIN;

    ws.emit('message', frame);
    await flush();

    expect(ws.closed).toEqual([]);
    expect(harness.ptyProcess.write).toHaveBeenCalledTimes(1);
    expect(harness.ptyProcess.writes[0]).toHaveLength(INSTALL_MAX_FRAME_BYTES - 1);
  });

  it('closes 65,537-byte messages with 1009 before PTY input', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');
    const frame = Buffer.alloc(INSTALL_MAX_FRAME_BYTES + 1, 0x78);
    frame[0] = MSG_STDIN;

    ws.emit('message', frame);
    await flush();

    expectCloseCode(ws, 1009);
    expect(harness.ptyProcess.write).not.toHaveBeenCalled();
  });

  it('closes frame-count backpressure and turns all queued continuations into no-ops', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    for (let index = 0; index < 257; index += 1) {
      ws.emit('message', Buffer.from([MSG_STDIN, 0x78]));
    }
    await flush();

    expect(ws.closed).toEqual([{ code: 1011, reason: 'Install input backpressure' }]);
    expect(harness.ptyProcess.write).not.toHaveBeenCalled();
    expect(harness.ptyProcess.resize).not.toHaveBeenCalled();
  });

  it('accepts exactly 256 queued frames', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    for (let index = 0; index < 256; index += 1) {
      ws.emit('message', Buffer.from([MSG_STDIN, 0x78]));
    }
    await flush();

    expect(ws.closed).toEqual([]);
    expect(harness.ptyProcess.write).toHaveBeenCalledTimes(256);
  });

  it('closes byte-count backpressure and turns all queued continuations into no-ops', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    for (let index = 0; index < 17; index += 1) {
      const frame = Buffer.alloc(INSTALL_MAX_FRAME_BYTES, 0x78);
      frame[0] = MSG_STDIN;
      ws.emit('message', frame);
    }
    await flush();

    expect(ws.closed).toEqual([{ code: 1011, reason: 'Install input backpressure' }]);
    expect(harness.ptyProcess.write).not.toHaveBeenCalled();
    expect(harness.ptyProcess.resize).not.toHaveBeenCalled();
  });

  it('accepts exactly one MiB of queued input', async () => {
    const harness = createHarness({ mode: 'authenticated' });
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');

    for (let index = 0; index < 16; index += 1) {
      const frame = Buffer.alloc(INSTALL_MAX_FRAME_BYTES, 0x78);
      frame[0] = MSG_STDIN;
      ws.emit('message', frame);
    }
    await flush();

    expect(ws.closed).toEqual([]);
    expect(harness.ptyProcess.write).toHaveBeenCalledTimes(16);
  });

  it('counts fragmented RawData toward the frame boundary and releases resources on overflow', async () => {
    const secondPty = new FakePty(1002);
    const harness = createHarness({ mode: 'authenticated' });
    harness.spawnPty.mockReturnValueOnce(harness.ptyProcess as unknown as pty.IPty)
      .mockReturnValueOnce(secondPty as unknown as pty.IPty);
    const ws = new FakeWebSocket();
    await start(harness.server, ws, '/api/install?command=codex', 'authenticated');
    const tasks = [...harness.scheduler.tasks];

    ws.emit('message', [
      Buffer.alloc(INSTALL_MAX_FRAME_BYTES),
      Buffer.from([0x78]),
    ]);
    await flush();

    expectCloseCode(ws, 1009);
    expect(harness.ptyProcess.destroy).toHaveBeenCalledTimes(1);
    for (const disposable of harness.ptyProcess.disposables) {
      expect(disposable.dispose).toHaveBeenCalledTimes(1);
    }
    for (const task of tasks) expect(task.cancel).toHaveBeenCalledTimes(1);

    const secondWs = new FakeWebSocket();
    await start(harness.server, secondWs, '/api/install?command=codex', 'authenticated');
    expect(secondWs.closed).toEqual([]);
  });
});
