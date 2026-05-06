import { describe, expect, it } from 'vitest';

import { evaluateStatusHookEvent } from '@/lib/status/hook-event-service';
import type { ITabStatusEntry } from '@/types/status';

const makeEntry = (overrides: Partial<ITabStatusEntry> = {}): ITabStatusEntry => ({
  cliState: 'idle',
  workspaceId: 'ws-1',
  tabName: 'Codex tab',
  tmuxSession: 'codexmux:tab',
  panelType: 'codex',
  eventSeq: 4,
  ...overrides,
});

describe('status hook event service', () => {
  it('classifies compact hooks without status transition', () => {
    expect(evaluateStatusHookEvent({
      event: 'pre-compact',
      entry: makeEntry(),
      providerId: 'codex',
      now: () => 1_000,
    })).toEqual({
      kind: 'compact',
      compactingSince: 1_000,
    });

    expect(evaluateStatusHookEvent({
      event: 'post-compact',
      entry: makeEntry(),
      providerId: 'codex',
      now: () => 1_000,
    })).toEqual({
      kind: 'compact',
      compactingSince: null,
    });
  });

  it('ignores unknown hooks and non-input notifications', () => {
    expect(evaluateStatusHookEvent({
      event: 'something-else',
      entry: makeEntry(),
      providerId: 'codex',
      now: () => 1_000,
    })).toEqual({
      kind: 'ignore',
      reason: 'unknown-event',
    });

    expect(evaluateStatusHookEvent({
      event: 'notification',
      notificationType: 'idle_prompt',
      entry: makeEntry(),
      providerId: 'codex',
      now: () => 1_000,
    })).toEqual({
      kind: 'ignore',
      reason: 'non-input-notification',
      eventName: 'notification',
    });
  });

  it('builds transition intent for prompt-submit hooks', () => {
    expect(evaluateStatusHookEvent({
      event: 'prompt-submit',
      entry: makeEntry({ cliState: 'idle', eventSeq: 2, jsonlPath: null }),
      providerId: 'codex',
      now: () => 2_000,
    })).toEqual({
      kind: 'processed',
      eventName: 'prompt-submit',
      lastEvent: { name: 'prompt-submit', at: 2_000, seq: 3 },
      prevState: 'idle',
      newState: 'busy',
      decision: { nextState: 'busy', changed: true, deferCodexStop: false },
      shouldResolveJsonl: true,
      shouldRecheckCodexStop: false,
      shouldRefreshStopSnippet: false,
    });
  });

  it('defers Codex stop to JSONL verification', () => {
    expect(evaluateStatusHookEvent({
      event: 'stop',
      entry: makeEntry({ cliState: 'busy', eventSeq: 1, jsonlPath: '/tmp/session.jsonl' }),
      providerId: 'codex',
      now: () => 3_000,
    })).toEqual({
      kind: 'processed',
      eventName: 'stop',
      lastEvent: { name: 'stop', at: 3_000, seq: 2 },
      prevState: 'busy',
      newState: 'busy',
      decision: { nextState: 'busy', changed: false, deferCodexStop: true },
      shouldResolveJsonl: false,
      shouldRecheckCodexStop: true,
      shouldRefreshStopSnippet: false,
    });
  });

  it('requests stop snippet refresh for non-Codex stop with JSONL path', () => {
    expect(evaluateStatusHookEvent({
      event: 'stop',
      entry: makeEntry({ cliState: 'busy', eventSeq: 1, panelType: undefined, jsonlPath: '/tmp/session.jsonl' }),
      providerId: null,
      now: () => 4_000,
    })).toEqual({
      kind: 'processed',
      eventName: 'stop',
      lastEvent: { name: 'stop', at: 4_000, seq: 2 },
      prevState: 'busy',
      newState: 'ready-for-review',
      decision: { nextState: 'ready-for-review', changed: true, deferCodexStop: false },
      shouldResolveJsonl: false,
      shouldRecheckCodexStop: false,
      shouldRefreshStopSnippet: true,
    });
  });
});
