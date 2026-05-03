import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { describe, expect, it, vi } from 'vitest';
import { handleRuntimeTerminalConnection, type IRuntimeTerminalSupervisor } from '@/lib/runtime/terminal-ws';
import {
  MSG_HEARTBEAT,
  encodeHeartbeat,
  encodeKillSession,
  encodeResize,
  encodeStdin,
  encodeStdout,
  encodeWebStdin,
} from '@/lib/terminal-protocol';

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  sent: unknown[] = [];
  closed: Array<{ code: number; reason: string }> = [];

  send = (data: unknown): void => {
    this.sent.push(data);
  };

  close = (code: number, reason: string): void => {
    this.closed.push({ code, reason });
    this.readyState = WebSocket.CLOSED;
    this.emit('close');
  };
}

const createSupervisor = () => {
  let send: ((data: string) => void) | null = null;
  let close: ((code: number, reason: string) => void) | null = null;
  const supervisor: IRuntimeTerminalSupervisor & {
    pushStdout: (data: string) => void;
    closeFromSupervisor: (code: number, reason: string) => void;
    attachDeferred?: { resolve: (value: { subscriberId: string }) => void; reject: (err: Error) => void };
  } = {
    attachTerminal: vi.fn(async (input) => {
      send = input.send;
      close = input.close;
      return { subscriberId: 'sub-a' };
    }),
    detachTerminal: vi.fn(async () => undefined),
    writeTerminal: vi.fn(async () => undefined),
    resizeTerminal: vi.fn(async () => undefined),
    pushStdout: (data) => send?.(data),
    closeFromSupervisor: (code, reason) => close?.(code, reason),
  };
  return supervisor;
};

describe('runtime terminal websocket', () => {
  it('attaches and sends stdout frames through the existing protocol', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();

    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    supervisor.pushStdout('hello');
    expect(ws.sent).toEqual([encodeStdout('hello')]);
  });

  it('routes stdin, web stdin, resize, and heartbeat frames after attach', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();
    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    ws.emit('message', encodeStdin('pwd\n'));
    ws.emit('message', encodeWebStdin('ls\n'));
    ws.emit('message', encodeResize(120, 40));
    ws.emit('message', encodeHeartbeat());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(supervisor.writeTerminal).toHaveBeenCalledWith({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: 'sub-a',
      data: 'pwd\n',
    });
    expect(supervisor.writeTerminal).toHaveBeenCalledWith({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: 'sub-a',
      data: 'ls\n',
    });
    expect(supervisor.resizeTerminal).toHaveBeenCalledWith({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: 'sub-a',
      cols: 120,
      rows: 40,
    });
    expect(ws.sent).toEqual([new Uint8Array([MSG_HEARTBEAT])]);
  });

  it('clamps oversized resize and ignores short or zero resize frames', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();
    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    ws.emit('message', encodeResize(650, 300));
    ws.emit('message', new Uint8Array([0x02, 0x00]).buffer);
    ws.emit('message', encodeResize(0, 24));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(supervisor.resizeTerminal).toHaveBeenCalledTimes(1);
    expect(supervisor.resizeTerminal).toHaveBeenCalledWith(expect.objectContaining({ cols: 500, rows: 200 }));
  });

  it('rejects websocket kill without terminal worker kill IPC', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();
    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    ws.emit('message', encodeKillSession());
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(ws.closed[0]).toMatchObject({ code: 1011 });
    expect(ws.closed[0].reason).toContain('unsupported');
    expect(supervisor.detachTerminal).toHaveBeenCalledTimes(1);
  });

  it('detaches once if close and error both fire', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();
    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    ws.emit('close');
    ws.emit('error', new Error('socket failed'));

    expect(supervisor.detachTerminal).toHaveBeenCalledTimes(1);
  });

  it('cleans up a pending attach if the socket closes before attach resolves', async () => {
    const ws = new FakeWebSocket();
    let resolveAttach: ((value: { subscriberId: string }) => void) | null = null;
    const supervisor = createSupervisor();
    supervisor.attachTerminal = (() => new Promise<{ subscriberId: string }>((resolve) => {
      resolveAttach = resolve;
    })) as IRuntimeTerminalSupervisor['attachTerminal'];

    const handled = handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);
    ws.emit('close');
    const finishAttach = resolveAttach as ((value: { subscriberId: string }) => void) | null;
    expect(finishAttach).not.toBeNull();
    finishAttach?.({ subscriberId: 'sub-late' });
    await handled;

    expect(supervisor.detachTerminal).toHaveBeenCalledWith({
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      subscriberId: 'sub-late',
    });
  });

  it('closes on input backpressure before passing overflow frames to supervisor', async () => {
    const ws = new FakeWebSocket();
    const supervisor = createSupervisor();
    await handleRuntimeTerminalConnection(ws as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    for (let i = 0; i < 257; i += 1) {
      ws.emit('message', encodeStdin('x'));
    }
    expect(ws.closed[0]).toEqual({ code: 1011, reason: 'Terminal input backpressure' });
    expect(supervisor.detachTerminal).toHaveBeenCalledTimes(1);
  });

  it('allows supervisor worker-exit close and a fresh socket attach', async () => {
    const firstWs = new FakeWebSocket();
    const secondWs = new FakeWebSocket();
    const supervisor = createSupervisor();

    await handleRuntimeTerminalConnection(firstWs as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);
    supervisor.closeFromSupervisor(1011, 'Terminal worker exited');
    await handleRuntimeTerminalConnection(secondWs as never, {
      sessionName: 'rtv2-ws-a-pane-b-tab-c',
      cols: 80,
      rows: 24,
    }, supervisor);

    expect(firstWs.closed).toEqual([{ code: 1011, reason: 'Terminal worker exited' }]);
    expect(supervisor.attachTerminal).toHaveBeenCalledTimes(2);
  });
});
