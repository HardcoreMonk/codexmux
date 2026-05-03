import { EventEmitter } from 'events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRuntimeEvent, createRuntimeReply } from '@/lib/runtime/ipc';
import { RuntimeWorkerClient } from '@/lib/runtime/worker-client';

class FakeChild extends EventEmitter {
  sent: unknown[] = [];
  killed = false;
  connected = true;

  send = (message: unknown, callback?: (err?: Error | null) => void): boolean => {
    this.sent.push(message);
    callback?.();
    return true;
  };

  kill = (): boolean => {
    this.killed = true;
    this.connected = false;
    this.emit('exit', 0, null);
    return true;
  };
}

describe('runtime worker client', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('correlates command replies', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('rejects reply envelope correlation mismatches before payload success', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'terminal.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects malformed replies with a known command id immediately', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: 'yes',
      payload: { ok: true },
    });

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('rejects discriminated reply shape violations immediately', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    });

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('drops malformed replies without a known command id until timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: 'yes',
      payload: { ok: true },
    });

    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });
    expect(child.killed).toBe(false);
    vi.useRealTimers();
  });

  it('rejects replies from the wrong worker source', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'terminal',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects replies addressed to the wrong target', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'terminal',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'invalid-worker-reply',
      retryable: false,
    });
  });

  it('rejects invalid registered command payloads before sending', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    await expect(client.request('terminal.resize', {
      sessionName: 'pt-ws-pane-tab',
      cols: 80,
      rows: 24,
    })).rejects.toThrow(/Invalid runtime IPC payload/);
    expect(child.sent).toEqual([]);
  });

  it('rejects unregistered commands before sending', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    await expect(client.request('storage.unknown', {})).rejects.toMatchObject({
      code: 'unsupported-runtime-command',
      retryable: false,
    });
    expect(child.sent).toEqual([]);
  });

  it('rejects invalid registered reply payloads', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.create-workspace', { name: 'Runtime', defaultCwd: '/tmp' });
    const sent = child.sent[0] as { id: string };
    child.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-workspace.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      payload: { id: 'ws-a' },
    });

    await expect(pending).rejects.toMatchObject({ code: 'invalid-worker-reply' });
  });

  it('times out pending commands', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    vi.advanceTimersByTime(25);

    await expect(pending).rejects.toThrow(/timed out/);
    vi.useRealTimers();
  });

  it('ignores late success replies after timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });

    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    const next = client.request('storage.health', {});
    const nextSent = child.sent[1] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: nextSent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('ignores late failed replies after timeout', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });

    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
      error: {
        code: 'late-domain-error',
        message: 'late failure',
        retryable: false,
      },
    }));

    const next = client.request('storage.health', {});
    const nextSent = child.sent[1] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: nextSent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('fails pending commands when the worker exits', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('terminal.create-session', {
      sessionName: 'rtv2-ws-pane-tab',
      cols: 80,
      rows: 24,
    });
    child.emit('exit', 1, null);

    await expect(pending).rejects.toThrow(/terminal worker exited/);
  });

  it('restarts with bounded backoff after a crash before the next request', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
    });

    client.start();
    first.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);

    expect(spawn).toHaveBeenCalledTimes(2);
    expect(second.connected).toBe(true);
    vi.useRealTimers();
  });

  it('increases restart backoff after repeated crashes and caps at max', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const third = new FakeChild();
    const fourth = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
      .mockReturnValueOnce(third as never)
      .mockReturnValueOnce(fourth as never);
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      maxRestartBackoffMs: 20,
    });

    client.start();
    first.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);
    second.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(3);
    third.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(20);
    expect(spawn).toHaveBeenCalledTimes(4);
    vi.useRealTimers();
  });

  it('resets restart backoff after a successful reply', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const third = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
      .mockReturnValueOnce(third as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      maxRestartBackoffMs: 20,
    });

    client.start();
    first.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);

    const pending = client.request('storage.health', {});
    const sent = second.sent[0] as { id: string };
    second.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(pending).resolves.toEqual({ ok: true });

    second.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('does not reset restart backoff after an invalid success reply payload', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const third = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never)
      .mockReturnValueOnce(third as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      maxRestartBackoffMs: 20,
    });

    client.start();
    first.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);

    const pending = client.request('storage.create-workspace', { name: 'Runtime', defaultCwd: '/tmp' });
    const sent = second.sent[0] as { id: string };
    second.emit('message', {
      kind: 'reply',
      id: 'bad-reply',
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-workspace.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      payload: { id: 'ws-a' },
    });
    await expect(pending).rejects.toMatchObject({ code: 'invalid-worker-reply' });

    second.emit('exit', 1, null);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('marks crash failures as retryable structured worker errors', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('terminal.create-session', {
      sessionName: 'rtv2-ws-pane-tab',
      cols: 80,
      rows: 24,
    });
    child.emit('exit', 1, null);

    await expect(pending).rejects.toMatchObject({
      code: 'worker-exited',
      retryable: true,
    });
  });

  it('handles error followed by exit once for the current child', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const onExit = vi.fn();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      onExit,
    });

    const pending = client.request('storage.health', {});
    first.emit('error', new Error('worker pipe failed'));
    first.emit('exit', 1, null);

    await expect(pending).rejects.toMatchObject({
      code: 'worker-error',
      retryable: true,
    });
    expect(onExit).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('kills the current child best-effort on worker error before restart', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
    });

    client.start();
    first.emit('error', new Error('worker pipe failed'));

    expect(first.killed).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('preserves structured failed worker replies', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.create-pending-terminal-tab', {
      id: 'tab-a',
      workspaceId: 'ws-a',
      paneId: 'pane-b',
      sessionName: 'rtv2-ws-a-pane-b-tab-a',
      cwd: '/tmp',
    });
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-pending-terminal-tab.reply',
      ok: false,
      payload: null,
      error: {
        code: 'runtime-v2-pane-workspace-mismatch',
        message: 'pane does not belong to workspace',
        retryable: false,
      },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'runtime-v2-pane-workspace-mismatch',
      retryable: false,
    });
  });

  it('preserves retryable structured failed worker replies', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
      error: {
        code: 'storage-busy',
        message: 'database is busy',
        retryable: true,
      },
    }));

    await expect(pending).rejects.toMatchObject({
      code: 'storage-busy',
      retryable: true,
    });
  });

  it('does not report ready until the readiness command succeeds', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      readinessCommand: 'storage.health',
    });

    const ready = client.waitUntilReady();
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(ready).resolves.toBeUndefined();
  });

  it('restarts the worker when readiness command times out', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 25,
      restartBackoffMs: 10,
      readinessCommand: 'storage.health',
    });

    const ready = client.waitUntilReady();
    await vi.advanceTimersByTimeAsync(25);
    await expect(ready).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });
    expect(first.killed).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('does not restart the worker for normal readiness failed replies', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const spawn = vi.fn(() => child as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      readinessCommand: 'storage.health',
    });

    const ready = client.waitUntilReady();
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
      error: {
        code: 'storage-schema-invalid',
        message: 'schema invalid',
        retryable: false,
      },
    }));

    await expect(ready).rejects.toMatchObject({
      code: 'storage-schema-invalid',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(child.killed).toBe(false);
    expect(spawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('restarts a disconnected child before sending a request', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    first.connected = false;
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
    });

    await expect(client.request('storage.health', {})).rejects.toMatchObject({
      code: 'worker-not-connected',
      retryable: true,
    });
    expect(first.killed).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it('delivers runtime events to onEvent', () => {
    const child = new FakeChild();
    const onEvent = vi.fn();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      onEvent,
    });

    client.start();
    const event = createRuntimeEvent({
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
    });
    child.emit('message', event);

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('delivers terminal backpressure events to onEvent', () => {
    const child = new FakeChild();
    const onEvent = vi.fn();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      onEvent,
    });

    client.start();
    const event = createRuntimeEvent({
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.backpressure',
      delivery: 'realtime',
      payload: {
        sessionName: 'rtv2-ws-pane-tab',
        pendingBytes: 4096,
        maxPendingStdoutBytes: 2048,
      },
    });
    child.emit('message', event);

    expect(onEvent).toHaveBeenCalledWith(event);
  });

  it('drops mismatched or malformed runtime events without restarting', () => {
    const child = new FakeChild();
    const onEvent = vi.fn();
    const onExit = vi.fn();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      onEvent,
      onExit,
    });

    client.start();
    child.emit('message', {
      kind: 'event',
      id: 'evt-source-mismatch',
      source: 'storage',
      target: 'supervisor',
      type: 'terminal.stdout',
      sentAt: new Date().toISOString(),
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
    });
    child.emit('message', {
      kind: 'event',
      id: 'evt-target-mismatch',
      source: 'terminal',
      target: 'storage',
      type: 'terminal.stdout',
      sentAt: new Date().toISOString(),
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-pane-tab', data: 'hello' },
    });
    child.emit('message', {
      kind: 'event',
      id: 'evt-malformed-payload',
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      sentAt: new Date().toISOString(),
      delivery: 'realtime',
      payload: { sessionName: 'pt-ws-pane-tab', data: 'hello' },
    });

    expect(onEvent).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(child.killed).toBe(false);
  });

  it('rejects pending and future commands and does not restart after shutdown', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    const spawn = vi.fn(() => child as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      readinessCommand: 'storage.health',
    });

    const pending = client.request('storage.health', {});
    client.shutdown();
    await expect(pending).rejects.toMatchObject({
      code: 'worker-shutdown',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(10);

    expect(child.killed).toBe(true);
    await expect(client.request('storage.health', {})).rejects.toMatchObject({
      code: 'worker-shutdown',
      retryable: false,
    });
    await expect(client.waitUntilReady()).rejects.toMatchObject({
      code: 'worker-shutdown',
      retryable: false,
    });
    client.start();
    expect(spawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('treats shutdown child kill failure as best-effort cleanup', async () => {
    vi.useFakeTimers();
    const child = new FakeChild();
    child.kill = vi.fn(() => {
      throw new Error('kill failed');
    });
    const spawn = vi.fn(() => child as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
    });

    const pending = client.request('storage.health', {});
    expect(() => client.shutdown()).not.toThrow();
    await expect(pending).rejects.toMatchObject({
      code: 'worker-shutdown',
      retryable: false,
    });
    await vi.advanceTimersByTimeAsync(10);

    await expect(client.request('storage.health', {})).rejects.toMatchObject({
      code: 'worker-shutdown',
      retryable: false,
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('treats child.send false as backpressure and waits for a reply', async () => {
    const child = new FakeChild();
    child.send = vi.fn((message: unknown, callback?: (err?: Error | null) => void) => {
      child.sent.push(message);
      callback?.();
      return false;
    });
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
    });

    const pending = client.request('storage.health', {});
    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));

    await expect(pending).resolves.toEqual({ ok: true });
  });

  it('restarts the worker when child.send callback reports an error', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    first.send = vi.fn((_message: unknown, callback?: (err?: Error | null) => void) => {
      callback?.(new Error('ipc channel closed'));
      return true;
    });
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      maxPendingRequests: 1,
    });

    await expect(client.request('storage.health', {})).rejects.toMatchObject({
      code: 'worker-not-connected',
      retryable: true,
    });
    expect(first.killed).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);

    const next = client.request('storage.health', {});
    const sent = second.sent[0] as { id: string };
    second.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('ignores child.send callback errors after request timeout', async () => {
    vi.useFakeTimers();
    let sendCallback: ((err?: Error | null) => void) | undefined;
    const child = new FakeChild();
    child.send = vi.fn((message: unknown, callback?: (err?: Error | null) => void) => {
      child.sent.push(message);
      sendCallback = callback;
      return true;
    });
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 25,
    });

    const pending = client.request('storage.health', {});
    await vi.advanceTimersByTimeAsync(25);
    await expect(pending).rejects.toMatchObject({
      code: 'worker-timeout',
      retryable: true,
    });

    sendCallback?.(new Error('late send failure'));
    expect(child.killed).toBe(false);
    const next = client.request('storage.health', {});
    const sent = child.sent[1] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('restarts the worker when child.send throws after registration', async () => {
    vi.useFakeTimers();
    const first = new FakeChild();
    const second = new FakeChild();
    first.send = vi.fn(() => {
      throw new Error('ipc channel closed');
    });
    const spawn = vi.fn()
      .mockReturnValueOnce(first as never)
      .mockReturnValueOnce(second as never);
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn,
      requestTimeoutMs: 1000,
      restartBackoffMs: 10,
      maxPendingRequests: 1,
    });

    await expect(client.request('storage.health', {})).rejects.toMatchObject({
      code: 'worker-not-connected',
      retryable: true,
    });
    expect(first.killed).toBe(true);
    await vi.advanceTimersByTimeAsync(10);
    expect(spawn).toHaveBeenCalledTimes(2);

    const next = client.request('storage.health', {});
    const sent = second.sent[0] as { id: string };
    second.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(next).resolves.toEqual({ ok: true });
    vi.useRealTimers();
  });

  it('rejects requests before sending when pending request limit is reached', async () => {
    const child = new FakeChild();
    const client = new RuntimeWorkerClient({
      name: 'storage',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      maxPendingRequests: 1,
    });

    const first = client.request('storage.health', {});
    await expect(client.request('storage.list-workspaces', {})).rejects.toMatchObject({
      code: 'worker-overloaded',
      retryable: true,
    });
    expect(child.sent).toHaveLength(1);

    const sent = child.sent[0] as { id: string };
    child.emit('message', createRuntimeReply({
      commandId: sent.id,
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      payload: { ok: true },
    }));
    await expect(first).resolves.toEqual({ ok: true });
  });

  it('ignores stale child events after shutdown listener cleanup', () => {
    const child = new FakeChild();
    const onEvent = vi.fn();
    const onExit = vi.fn();
    const client = new RuntimeWorkerClient({
      name: 'terminal',
      spawn: () => child as never,
      requestTimeoutMs: 1000,
      onEvent,
      onExit,
    });

    client.start();
    client.shutdown();
    child.emit('message', createRuntimeEvent({
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-pane-tab', data: 'late output' },
    }));
    child.emit('exit', 1, null);

    expect(onEvent).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });
});
