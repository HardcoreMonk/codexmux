import { describe, expect, it } from 'vitest';

import { reduceCodexState, reduceHookState } from '@/lib/status-state-machine';

describe('reduceHookState', () => {
  it('keeps Codex stop hooks out of direct ready-for-review transitions', () => {
    const decision = reduceHookState({
      currentState: 'busy',
      eventName: 'stop',
      providerId: 'codex',
    });

    expect(decision).toMatchObject({
      nextState: 'busy',
      changed: false,
      deferCodexStop: true,
    });
  });

  it('allows non-Codex stop hooks to move to ready-for-review', () => {
    const decision = reduceHookState({
      currentState: 'busy',
      eventName: 'stop',
      providerId: null,
    });

    expect(decision).toMatchObject({
      nextState: 'ready-for-review',
      changed: true,
      deferCodexStop: false,
    });
  });

  it('does not transition cancelled tabs from hook events', () => {
    const decision = reduceHookState({
      currentState: 'cancelled',
      eventName: 'stop',
      providerId: 'codex',
    });

    expect(decision).toMatchObject({
      nextState: 'cancelled',
      changed: false,
      deferCodexStop: false,
    });
  });
});

describe('reduceCodexState', () => {
  it('moves active completed Codex turns to ready-for-review with notification enabled', () => {
    const decision = reduceCodexState({
      currentState: 'busy',
      running: true,
      hasJsonlPath: true,
      idle: true,
      hasCompletionSnippet: true,
    });

    expect(decision).toEqual({
      nextState: 'ready-for-review',
      changed: true,
      silent: false,
      skipHistory: false,
    });
  });

  it('keeps incomplete Codex turns busy even when JSONL has assistant text', () => {
    const decision = reduceCodexState({
      currentState: 'ready-for-review',
      running: true,
      hasJsonlPath: true,
      idle: false,
      hasCompletionSnippet: true,
    });

    expect(decision).toEqual({
      nextState: 'busy',
      changed: true,
      silent: false,
    });
  });

  it('does not send review notifications for restored completed turns', () => {
    const decision = reduceCodexState({
      currentState: 'idle',
      running: true,
      hasJsonlPath: true,
      idle: true,
      hasCompletionSnippet: true,
    });

    expect(decision).toEqual({
      nextState: 'ready-for-review',
      changed: true,
      silent: true,
      skipHistory: true,
    });
  });

  it('moves unknown tabs without a bound JSONL to busy silently', () => {
    const decision = reduceCodexState({
      currentState: 'unknown',
      running: true,
      hasJsonlPath: false,
      idle: false,
      hasCompletionSnippet: false,
    });

    expect(decision).toEqual({
      nextState: 'busy',
      changed: true,
      silent: true,
    });
  });
});
