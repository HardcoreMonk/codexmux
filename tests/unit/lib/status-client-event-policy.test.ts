import { describe, expect, it } from 'vitest';
import { evaluateStatusClientEvent } from '@/lib/status-client-event-policy';

describe('status client event policy', () => {
  it('accepts ready-for-review dismiss events', () => {
    expect(evaluateStatusClientEvent({
      eventType: 'dismiss-tab',
      currentState: 'ready-for-review',
      lastEventName: null,
      lastEventSeq: null,
      clientSeq: null,
    })).toEqual({
      accepted: true,
      nextState: 'idle',
      setDismissedAt: true,
      persistLayout: true,
      broadcastUpdate: true,
      updateSessionHistoryDismissedAt: true,
    });
  });

  it('ignores dismiss events outside ready-for-review state', () => {
    expect(evaluateStatusClientEvent({
      eventType: 'dismiss-tab',
      currentState: 'busy',
      lastEventName: null,
      lastEventSeq: null,
      clientSeq: null,
    })).toEqual({
      accepted: false,
      nextState: null,
      setDismissedAt: false,
      persistLayout: false,
      broadcastUpdate: false,
      updateSessionHistoryDismissedAt: false,
    });
  });

  it('accepts matching needs-input notification ack events', () => {
    expect(evaluateStatusClientEvent({
      eventType: 'ack-notification',
      currentState: 'needs-input',
      lastEventName: 'notification',
      lastEventSeq: 7,
      clientSeq: 7,
    })).toEqual({
      accepted: true,
      nextState: 'busy',
      setDismissedAt: false,
      persistLayout: true,
      broadcastUpdate: true,
      updateSessionHistoryDismissedAt: false,
    });
  });

  it('ignores ack events when the notification sequence does not match', () => {
    expect(evaluateStatusClientEvent({
      eventType: 'ack-notification',
      currentState: 'needs-input',
      lastEventName: 'notification',
      lastEventSeq: 7,
      clientSeq: 8,
    })).toEqual({
      accepted: false,
      nextState: null,
      setDismissedAt: false,
      persistLayout: false,
      broadcastUpdate: false,
      updateSessionHistoryDismissedAt: false,
    });
  });
});
