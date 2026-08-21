import { beforeEach, describe, expect, it } from 'vitest';
import useGitRefreshGeneration from '@/hooks/use-git-refresh-generation';

describe('useGitRefreshGeneration', () => {
  beforeEach(() => useGitRefreshGeneration.getState().reset());

  it('increments once per newer stop sequence and isolates sessions', () => {
    expect(useGitRefreshGeneration.getState().invalidate('session-a', 3)).toBe(true);
    expect(useGitRefreshGeneration.getState().invalidate('session-a', 3)).toBe(false);
    expect(useGitRefreshGeneration.getState().invalidate('session-a', 2)).toBe(false);
    expect(useGitRefreshGeneration.getState().invalidate('session-b', 3)).toBe(true);
    expect(useGitRefreshGeneration.getState().generations).toEqual({
      'session-a': 1,
      'session-b': 1,
    });
  });
});
