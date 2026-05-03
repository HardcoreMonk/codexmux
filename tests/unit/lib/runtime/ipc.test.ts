import { describe, expect, it } from 'vitest';
import {
  createRuntimeCommand,
  createRuntimeEvent,
  createRuntimeReply,
  parseRuntimeCommandPayload,
  parseRuntimeEventPayload,
  parseRuntimeMessage,
  parseRuntimeReplyPayload,
  runtimeCommandRegistry,
  runtimeEventRegistry,
} from '@/lib/runtime/ipc';

describe('runtime ipc', () => {
  it('creates and parses command envelopes', () => {
    const msg = createRuntimeCommand({
      id: 'cmd-1',
      source: 'supervisor',
      target: 'storage',
      type: 'storage.health',
      payload: { ping: true },
    });

    expect(parseRuntimeMessage(msg)).toEqual(msg);
    expect(msg.kind).toBe('command');
    expect(msg.sentAt).toMatch(/T/);
  });

  it('creates reply envelopes linked to commands', () => {
    const reply = createRuntimeReply({
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      error: { code: 'storage-unavailable', message: 'database locked', retryable: true },
      payload: null,
    });

    expect(reply.kind).toBe('reply');
    expect(reply.commandId).toBe('cmd-1');
    expect(reply.error?.retryable).toBe(true);
  });

  it('rejects malformed envelopes', () => {
    expect(() => parseRuntimeMessage({ kind: 'command', id: 'x' })).toThrow(/Invalid runtime IPC message/);
  });

  it('rejects reply envelopes with invalid success or failure shape', () => {
    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    })).toThrow(/Invalid runtime IPC message/);

    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-2',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: false,
      payload: null,
    })).toThrow(/Invalid runtime IPC message/);

    expect(() => parseRuntimeMessage({
      kind: 'reply',
      id: 'reply-3',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      sentAt: new Date().toISOString(),
      ok: false,
      error: { code: 'storage-unavailable', message: 'database locked' },
      payload: { ok: false },
    })).toThrow(/Invalid runtime IPC message/);
  });

  it('validates reply constructors before returning', () => {
    expect(() => createRuntimeReply({
      id: 'reply-1',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: true,
      error: { code: 'should-not-exist', message: 'unexpected' },
      payload: { ok: true },
    } as never)).toThrow(/Invalid runtime IPC message/);

    expect(() => createRuntimeReply({
      id: 'reply-2',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.health.reply',
      ok: false,
      payload: null,
    } as never)).toThrow(/Invalid runtime IPC message/);

    expect(() => createRuntimeReply({
      id: 'reply-3',
      commandId: 'cmd-1',
      source: 'storage',
      target: 'supervisor',
      type: 'storage.create-workspace.reply',
      ok: true,
      payload: { id: 'ws-a' },
    })).toThrow(/Invalid runtime IPC reply/);
  });

  it('distinguishes durable and realtime events', () => {
    const event = createRuntimeEvent({
      id: 'evt-1',
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'hello' },
    });

    expect(event.kind).toBe('event');
    expect(event.delivery).toBe('realtime');
  });

  it('validates event payloads through the event registry', () => {
    expect(runtimeEventRegistry['terminal.stdout']).toMatchObject({
      source: 'terminal',
      target: 'supervisor',
      delivery: 'realtime',
    });

    const payload = parseRuntimeEventPayload('terminal.stdout', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      data: 'hello',
    });

    expect(payload).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      data: 'hello',
    });
    expect(() => parseRuntimeEventPayload('terminal.stdout', {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      data: 'hello',
    })).toThrow(/Invalid runtime IPC event/);

    expect(runtimeEventRegistry['terminal.backpressure']).toMatchObject({
      source: 'terminal',
      target: 'supervisor',
      delivery: 'realtime',
    });

    const backpressure = parseRuntimeEventPayload('terminal.backpressure', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: 4096,
      maxPendingStdoutBytes: 2048,
    });

    expect(backpressure).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: 4096,
      maxPendingStdoutBytes: 2048,
    });
    expect(() => parseRuntimeEventPayload('terminal.backpressure', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      pendingBytes: -1,
      maxPendingStdoutBytes: 2048,
    })).toThrow(/Invalid runtime IPC event/);
  });

  it('validates registered event constructors before returning', () => {
    expect(() => createRuntimeEvent({
      id: 'evt-1',
      source: 'terminal',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'pt-ws-a-pane-b-tab-c', data: 'hello' },
    })).toThrow(/Invalid runtime IPC event/);

    expect(() => createRuntimeEvent({
      id: 'evt-2',
      source: 'storage',
      target: 'supervisor',
      type: 'terminal.stdout',
      delivery: 'realtime',
      payload: { sessionName: 'rtv2-ws-a-pane-b-tab-c', data: 'hello' },
    })).toThrow(/Invalid runtime IPC event/);
  });

  it('validates command payloads through the command registry', () => {
    expect(runtimeCommandRegistry['storage.delete-workspace']).toBeDefined();

    const payload = parseRuntimeCommandPayload('terminal.resize', {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    });

    expect(payload).toEqual({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    });
    expect(() => parseRuntimeCommandPayload('terminal.resize', {
      sessionName: 'pt-ws-a-pane-b-tab-c',
      cols: 100,
      rows: 30,
    })).toThrow(/Invalid runtime IPC payload/);

    for (const oversized of [
      { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 501, rows: 30 },
      { sessionName: 'rtv2-ws-a-pane-b-tab-c', cols: 100, rows: 201 },
    ]) {
      expect(() => parseRuntimeCommandPayload('terminal.resize', oversized)).toThrow(/Invalid runtime IPC payload/);
      expect(() => parseRuntimeCommandPayload('terminal.attach', oversized)).toThrow(/Invalid runtime IPC payload/);
      expect(() => parseRuntimeCommandPayload('terminal.create-session', { ...oversized, cwd: '/tmp' })).toThrow(/Invalid runtime IPC payload/);
    }
  });

  it('rejects tmux-unsafe runtime session names', () => {
    for (const sessionName of [
      'rtv2-ws-a:pane-b-tab-c',
      'rtv2-ws-a pane-b-tab-c',
      'rtv2-ws-a/pane-b-tab-c',
      'rtv2-Ws-a-pane-b-tab-c',
      `rtv2-${'a'.repeat(200)}`,
    ]) {
      expect(() => parseRuntimeCommandPayload('terminal.attach', {
        sessionName,
        cols: 80,
        rows: 24,
      })).toThrow(/Invalid runtime IPC payload/);
    }
  });

  it('validates reply payloads through the command registry', () => {
    expect(parseRuntimeReplyPayload('storage.create-workspace', {
      id: 'ws-a',
      rootPaneId: 'pane-a',
    })).toEqual({ id: 'ws-a', rootPaneId: 'pane-a' });

    expect(() => parseRuntimeReplyPayload('storage.create-workspace', {
      id: 'ws-a',
    })).toThrow(/Invalid runtime IPC reply/);
  });
});
