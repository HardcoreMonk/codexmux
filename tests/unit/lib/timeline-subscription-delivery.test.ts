import type { WebSocket } from 'ws';
import { describe, expect, it } from 'vitest';

import { createTimelineSubscriptionDelivery } from '@/lib/timeline/subscription-delivery';
import type { IFileWatcher } from '@/lib/timeline-server-state';
import type { TTimelineServerMessage } from '@/types/timeline';

interface IFakeSocket {
  id: string;
  sent: string[];
  send: (raw: string) => void;
}

const makeSocket = (id: string): WebSocket => {
  const socket: IFakeSocket = {
    id,
    sent: [],
    send: (raw: string) => {
      socket.sent.push(raw);
    },
  };
  return socket as unknown as WebSocket;
};

const getSent = (ws: WebSocket): TTimelineServerMessage[] =>
  ((ws as unknown as IFakeSocket).sent).map((raw) => JSON.parse(raw) as TTimelineServerMessage);

const makeWatcher = (jsonlPath: string, connections: WebSocket[]): IFileWatcher => ({
  watcher: null,
  jsonlPath,
  offset: 0,
  pendingBuffer: '',
  connections: new Set(connections),
  debounceTimer: null,
  retryCount: 0,
  sessionName: 'codexmux:tab',
  provider: {} as never,
  summaryResolved: false,
  processing: false,
  pendingChange: false,
  initOffsets: new Map(),
});

describe('timeline subscription delivery facade', () => {
  it('sends JSON only when the socket can send', () => {
    const ws = makeSocket('ws-1');
    const delivery = createTimelineSubscriptionDelivery({
      fileWatchers: new Map(),
      canSend: () => true,
    });

    expect(delivery.send(ws, { type: 'timeline:append', entries: [] })).toBe(true);
    expect(getSent(ws)).toEqual([{ type: 'timeline:append', entries: [] }]);

    const blocked = createTimelineSubscriptionDelivery({
      fileWatchers: new Map(),
      canSend: () => false,
    });
    expect(blocked.send(ws, { type: 'timeline:error', code: 'blocked', message: 'blocked' })).toBe(false);
    expect(getSent(ws)).toHaveLength(1);
  });

  it('broadcasts watcher messages to sendable watcher subscribers only', () => {
    const ready = makeSocket('ready');
    const blocked = makeSocket('blocked');
    const fileWatchers = new Map([
      ['/tmp/session.jsonl', makeWatcher('/tmp/session.jsonl', [ready, blocked])],
    ]);
    const delivery = createTimelineSubscriptionDelivery({
      fileWatchers,
      canSend: (ws) => ws === ready,
    });

    expect(delivery.broadcastWatcher('/tmp/session.jsonl', {
      type: 'timeline:error',
      code: 'watcher-failed',
      message: 'File watch failed',
    })).toBe(1);
    expect(getSent(ready)).toEqual([{
      type: 'timeline:error',
      code: 'watcher-failed',
      message: 'File watch failed',
    }]);
    expect(getSent(blocked)).toEqual([]);
  });

  it('treats missing watcher broadcast as a no-op', () => {
    const delivery = createTimelineSubscriptionDelivery({
      fileWatchers: new Map(),
      canSend: () => true,
    });

    expect(delivery.broadcastWatcher('/tmp/missing.jsonl', {
      type: 'timeline:error',
      code: 'missing',
      message: 'missing',
    })).toBe(0);
  });

  it('broadcasts session stats only to watchers whose JSONL path maps to the stats session id', () => {
    const matching = makeSocket('matching');
    const other = makeSocket('other');
    const fileWatchers = new Map([
      ['/tmp/session-a.jsonl', makeWatcher('/tmp/session-a.jsonl', [matching])],
      ['/tmp/session-b.jsonl', makeWatcher('/tmp/session-b.jsonl', [other])],
    ]);
    const delivery = createTimelineSubscriptionDelivery({
      fileWatchers,
      canSend: () => true,
      getSessionIdFromJsonlPath: (jsonlPath) => jsonlPath.includes('session-a') ? 'session-a' : 'session-b',
    });

    expect(delivery.broadcastSessionStats({
      sessionId: 'session-a',
      inputTokens: 10,
    })).toBe(1);
    expect(getSent(matching)).toEqual([{
      type: 'timeline:stats-update',
      sessionStats: {
        sessionId: 'session-a',
        inputTokens: 10,
      },
    }]);
    expect(getSent(other)).toEqual([]);
  });
});
