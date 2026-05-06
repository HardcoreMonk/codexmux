import { describe, expect, it } from 'vitest';
import {
  selectAgentPanelContentMode,
  selectAgentSessionListRenderMode,
} from '@/lib/session-list-rendering';

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

describe('selectAgentPanelContentMode', () => {
  it('keeps timeline rendering visible while agent process detection is still pending', () => {
    expect(selectAgentPanelContentMode({
      agentProcess: null,
      view: 'timeline',
    })).toBe('timeline');
  });

  it('keeps check and session-list views owned by their explicit states', () => {
    expect(selectAgentPanelContentMode({
      agentProcess: null,
      view: 'check',
    })).toBe('check');

    expect(selectAgentPanelContentMode({
      agentProcess: null,
      view: 'session-list',
    })).toBe('session-list');
  });
});
