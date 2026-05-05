import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { handleRuntimeTimelineConnection } from '@/lib/runtime/timeline-ws';
import type {
  IRuntimeTimelineLiveAppendEvent,
  IRuntimeTimelineLiveSubscribeInput,
  IRuntimeTimelineSessionChangedEvent,
  IRuntimeTimelineSessionWatchSubscribeInput,
} from '@/lib/runtime/contracts';
import type { IRuntimeSupervisor } from '@/lib/runtime/supervisor';

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

const sessionJsonlPath = `${process.env.HOME}/.codex/sessions/session-a.jsonl`;

const createSupervisor = () => {
  let onAppend: ((event: IRuntimeTimelineLiveAppendEvent) => void) | undefined;
  let onError: ((event: { code: string; message: string }) => void) | undefined;
  let onChanged: ((event: IRuntimeTimelineSessionChangedEvent) => void) | undefined;
  const calls: string[] = [];
  const supervisor = {
    subscribeTimelineLive: vi.fn(async (input: IRuntimeTimelineLiveSubscribeInput) => {
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
          jsonlPath: sessionJsonlPath,
        },
      };
    }),
    unsubscribeTimelineLive: vi.fn(async () => ({ subscriberId: 'sub-live', unsubscribed: true })),
    subscribeTimelineSessionWatch: vi.fn(async (input: IRuntimeTimelineSessionWatchSubscribeInput) => {
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

const createConnectionInput = (overrides: Partial<Parameters<typeof handleRuntimeTimelineConnection>[1]> = {}) => ({
  sessionName: 'pt-ws-a-pane-b-tab-c',
  panePid: 123,
  panelType: 'codex',
  provider: {
    panelType: 'codex',
    displayName: 'Codex',
    isValidSessionId: () => true,
  } as never,
  detectActiveSession: async () => ({
    status: 'running' as const,
    sessionId: 'session-a',
    jsonlPath: sessionJsonlPath,
    pid: 456,
    startedAt: 1,
    cwd: process.env.HOME ?? '',
  }),
  resolveInitialJsonl: async () => ({
    jsonlPath: sessionJsonlPath,
    sessionId: 'session-a',
  }),
  handleResume: vi.fn(),
  updateTabAgentSessionId: vi.fn(),
  ...overrides,
});

describe('runtime timeline websocket bridge', () => {
  it('delivers init and append through Runtime v2 live subscription', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();

    await handleRuntimeTimelineConnection(ws as never, createConnectionInput({
      supervisor: fake.supervisor,
    }));

    expect(ws.sent).toContainEqual(expect.objectContaining({
      type: 'timeline:session-changed',
      newSessionId: 'session-a',
      reason: 'session-waiting',
    }));
    expect(ws.sent).toContainEqual(expect.objectContaining({
      type: 'timeline:init',
      sessionId: 'session-a',
      jsonlPath: sessionJsonlPath,
    }));

    fake.emitAppend({
      subscriberId: 'sub-live',
      jsonlPath: sessionJsonlPath,
      entries: [{ id: 'entry-a', type: 'user-message', timestamp: 1, text: 'hello' }],
    });

    expect(ws.sent).toContainEqual({
      type: 'timeline:append',
      entries: [{ id: 'entry-a', type: 'user-message', timestamp: 1, text: 'hello' }],
    });
  });

  it('unsubscribes live and session watcher subscriptions once on close', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();

    await handleRuntimeTimelineConnection(ws as never, createConnectionInput({
      supervisor: fake.supervisor,
    }));

    ws.close(1000, 'test close');
    ws.emit('close');

    expect(fake.supervisor.unsubscribeTimelineLive).toHaveBeenCalledTimes(1);
    expect(fake.supervisor.unsubscribeTimelineLive).toHaveBeenCalledWith('sub-live');
    expect(fake.supervisor.unsubscribeTimelineSessionWatch).toHaveBeenCalledTimes(1);
    expect(fake.supervisor.unsubscribeTimelineSessionWatch).toHaveBeenCalledWith('sub-watch');
  });

  it('keeps timeline resume delegated to the legacy handler', async () => {
    const fake = createSupervisor();
    const ws = new FakeSocket();
    const handleResume = vi.fn();

    await handleRuntimeTimelineConnection(ws as never, createConnectionInput({
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
    }));

    ws.receive({ type: 'timeline:resume', sessionId: 'session-a', tmuxSession: 'pt-ws-a-pane-b-tab-c' });

    await vi.waitFor(() => {
      expect(handleResume).toHaveBeenCalledWith({
        sessionId: 'session-a',
        tmuxSession: 'pt-ws-a-pane-b-tab-c',
      });
    });
  });
});
