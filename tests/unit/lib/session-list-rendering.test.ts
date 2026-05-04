import { describe, expect, it } from 'vitest';
import { selectAgentSessionListRenderMode } from '@/lib/session-list-rendering';

describe('selectAgentSessionListRenderMode', () => {
  it('keeps the session list shell visible when an agent panel has no sessions', () => {
    expect(selectAgentSessionListRenderMode({
      isAgentPanel: true,
      isLoading: false,
      sessionCount: 0,
    })).toBe('list');
  });

  it('uses the spinner while the first session page is loading', () => {
    expect(selectAgentSessionListRenderMode({
      isAgentPanel: true,
      isLoading: true,
      sessionCount: 0,
    })).toBe('spinner');
  });

  it('uses the empty state for non-agent panels', () => {
    expect(selectAgentSessionListRenderMode({
      isAgentPanel: false,
      isLoading: false,
      sessionCount: 0,
    })).toBe('empty');
  });
});
