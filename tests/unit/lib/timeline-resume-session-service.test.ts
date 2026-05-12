import type { WebSocket } from 'ws';
import { describe, expect, it, vi } from 'vitest';

import { createTimelineResumeSessionService } from '@/lib/timeline/resume-session-service';
import type { IAgentProvider } from '@/lib/providers';
import type { TTimelineServerMessage } from '@/types/timeline';

interface IFakeSocket {
  sent: TTimelineServerMessage[];
  send: (message: TTimelineServerMessage) => boolean;
}

const makeSocket = (): WebSocket & IFakeSocket => {
  const socket = {
    sent: [],
    send: (message: TTimelineServerMessage) => {
      socket.sent.push(message);
      return true;
    },
  } as unknown as WebSocket & IFakeSocket;
  return socket;
};

const makeProvider = (overrides: Partial<IAgentProvider> = {}): IAgentProvider => ({
  id: 'codex',
  displayName: 'Codex',
  panelType: 'codex',
  statusBehavior: {
    watchJsonlWhenBound: true,
    deferStopHookUntilJsonlIdle: true,
  },
  matchesProcess: vi.fn(),
  isValidSessionId: (id: unknown): id is string => typeof id === 'string',
  detectActiveSession: vi.fn(),
  isAgentRunning: vi.fn(),
  watchSessions: vi.fn(),
  buildResumeCommand: vi.fn(async (sessionId: string) => `codex resume ${sessionId}`),
  buildLaunchCommand: vi.fn(),
  resolveJsonlPath: vi.fn(async (sessionId: string) => `/tmp/${sessionId}.jsonl`),
  resolveLatestJsonlPath: vi.fn(),
  parseJsonlContent: vi.fn(),
  readTailEntries: vi.fn(),
  readEntriesBefore: vi.fn(),
  parseIncremental: vi.fn(),
  readSessionId: vi.fn(),
  writeSessionId: vi.fn(),
  readJsonlPath: vi.fn(),
  writeJsonlPath: vi.fn(),
  readSummary: vi.fn(),
  writeSummary: vi.fn(),
  ...overrides,
});

const createService = (overrides: Partial<Parameters<typeof createTimelineResumeSessionService>[0]> = {}) => {
  const send = vi.fn((ws: WebSocket, message: TTimelineServerMessage) =>
    (ws as WebSocket & IFakeSocket).send(message));
  return {
    send,
    service: createTimelineResumeSessionService({
      send,
      checkTerminalProcess: vi.fn(async () => ({ isSafe: true })),
      sendKeys: vi.fn(),
      parseSessionName: vi.fn(() => ({ wsId: 'ws-1' })),
      updateTabAgentSessionId: vi.fn(),
      readTabAgentJsonlPath: vi.fn(async () => null),
      getSessionCwd: vi.fn(async () => '/workspace'),
      isAllowedJsonlPath: vi.fn(() => true),
      existsPath: vi.fn(() => true),
      statFileMtimeMs: vi.fn(async (filePath: string) => filePath.includes('latest') ? 200 : 100),
      checkJsonlState: vi.fn(async () => ({ interrupted: false })),
      extractSessionIdFromJsonlPath: vi.fn((filePath: string) => filePath.includes('latest') ? 'latest' : 'active'),
      ...overrides,
    }),
  };
};

describe('timeline resume session service', () => {
  it('prefers the latest cwd JSONL when the active Codex JSONL is interrupted', async () => {
    const provider = makeProvider({
      resolveLatestJsonlPath: vi.fn(async () => ({
        jsonlPath: '/tmp/latest.jsonl',
        sessionId: 'latest',
        mtimeMs: 200,
      })),
    });
    const { service } = createService({
      checkJsonlState: vi.fn(async () => ({ interrupted: true })),
    });

    await expect(service.resolveActiveOrLatestJsonl(
      provider,
      'codexmux:tab',
      '/tmp/active.jsonl',
      'active',
    )).resolves.toMatchObject({
      jsonlPath: '/tmp/latest.jsonl',
      sessionId: 'latest',
    });

    const notInterrupted = createService({
      checkJsonlState: vi.fn(async () => ({ interrupted: false })),
    }).service;
    await expect(notInterrupted.resolveActiveOrLatestJsonl(
      provider,
      'codexmux:tab',
      '/tmp/active.jsonl',
      'active',
    )).resolves.toMatchObject({
      jsonlPath: '/tmp/active.jsonl',
      sessionId: 'active',
    });
  });

  it('keeps the active Codex JSONL when it is idle', async () => {
    const provider = makeProvider({
      resolveLatestJsonlPath: vi.fn(async () => ({
        jsonlPath: '/tmp/latest.jsonl',
        sessionId: 'latest',
        mtimeMs: 200,
      })),
    });
    const { service } = createService({
      checkJsonlState: vi.fn(async () => ({ idle: true, interrupted: false })),
    });

    await expect(service.resolveActiveOrLatestJsonl(
      provider,
      'codexmux:tab',
      '/tmp/active.jsonl',
      'active',
    )).resolves.toMatchObject({
      jsonlPath: '/tmp/active.jsonl',
      sessionId: 'active',
    });
  });

  it('blocks resume when the terminal process is unsafe', async () => {
    const ws = makeSocket();
    const sendKeys = vi.fn();
    const { service } = createService({
      checkTerminalProcess: vi.fn(async () => ({ isSafe: false, processName: 'codex' })),
      sendKeys,
    });

    await expect(service.resolveResumeMessage(ws, {
      sessionName: 'codexmux:tab',
      provider: makeProvider(),
    }, {
      sessionId: 'session-a',
      tmuxSession: 'codexmux:tab',
    })).resolves.toBeUndefined();

    expect(sendKeys).not.toHaveBeenCalled();
    expect(ws.sent).toEqual([{
      type: 'timeline:resume-blocked',
      reason: 'process-running',
      processName: 'codex',
    }]);
  });

  it('sends resume command and resume-started when the terminal is safe', async () => {
    const ws = makeSocket();
    const sendKeys = vi.fn();
    const updateTabAgentSessionId = vi.fn();
    const provider = makeProvider();
    const { service } = createService({ sendKeys, updateTabAgentSessionId });

    await expect(service.resolveResumeMessage(ws, {
      sessionName: 'codexmux:tab',
      provider,
    }, {
      sessionId: 'session-a',
      tmuxSession: 'codexmux:tab',
    })).resolves.toEqual({
      jsonlPath: '/tmp/session-a.jsonl',
      sessionId: 'session-a',
    });

    expect(provider.buildResumeCommand).toHaveBeenCalledWith('session-a', { workspaceId: 'ws-1' });
    expect(sendKeys).toHaveBeenCalledWith('codexmux:tab', 'codex resume session-a');
    expect(updateTabAgentSessionId).toHaveBeenCalledWith('codexmux:tab', provider, 'session-a');
    expect(ws.sent).toEqual([{
      type: 'timeline:resume-started',
      sessionId: 'session-a',
      jsonlPath: '/tmp/session-a.jsonl',
    }]);
  });

  it('emits session-changed through the injected delivery sender', () => {
    const ws = makeSocket();
    const { service } = createService();

    expect(service.sendSessionChanged(ws, 'session-a', 'new-session-started')).toBe(true);
    expect(ws.sent).toEqual([{
      type: 'timeline:session-changed',
      newSessionId: 'session-a',
      reason: 'new-session-started',
    }]);
  });
});
