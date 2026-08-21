import { describe, expect, it } from 'vitest';
import { consumeGitRefreshGeneration } from '@/lib/git-refresh-generation';

describe('consumeGitRefreshGeneration', () => {
  it('defers inactive generations and consumes them when the session becomes active', () => {
    const deferred = consumeGitRefreshGeneration({
      consumed: {},
      sessionName: 'session-a',
      generation: 1,
      active: false,
    });
    expect(deferred).toEqual({ shouldRefresh: false, consumed: {} });

    const active = consumeGitRefreshGeneration({
      consumed: deferred.consumed,
      sessionName: 'session-a',
      generation: 1,
      active: true,
    });
    expect(active).toEqual({
      shouldRefresh: true,
      consumed: { 'session-a': 1 },
    });
  });

  it('deduplicates each session independently when a hook instance changes tabs', () => {
    const first = consumeGitRefreshGeneration({
      consumed: {},
      sessionName: 'session-a',
      generation: 3,
      active: true,
    });
    const switched = consumeGitRefreshGeneration({
      consumed: first.consumed,
      sessionName: 'session-b',
      generation: 1,
      active: true,
    });
    const duplicate = consumeGitRefreshGeneration({
      consumed: switched.consumed,
      sessionName: 'session-b',
      generation: 1,
      active: true,
    });

    expect(switched).toEqual({
      shouldRefresh: true,
      consumed: { 'session-a': 3, 'session-b': 1 },
    });
    expect(duplicate).toEqual({
      shouldRefresh: false,
      consumed: switched.consumed,
    });
  });

  it('ignores empty sessions and non-positive generations', () => {
    expect(consumeGitRefreshGeneration({
      consumed: {},
      sessionName: '',
      generation: 1,
      active: true,
    }).shouldRefresh).toBe(false);
    expect(consumeGitRefreshGeneration({
      consumed: {},
      sessionName: 'session-a',
      generation: 0,
      active: true,
    }).shouldRefresh).toBe(false);
  });
});
