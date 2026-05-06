import { beforeEach, describe, expect, it } from 'vitest';

import useTabStore from '@/hooks/use-tab-store';

describe('useTabStore agent process view state', () => {
  beforeEach(() => {
    useTabStore.setState({
      tabs: {},
      tabOrders: {},
      statusWsConnected: false,
    });
  });

  it('keeps Codex tabs on the timeline when the process exits', () => {
    useTabStore.getState().initTab('tab-codex', {
      workspaceId: 'ws-test',
      panelType: 'codex',
      agentProcess: true,
      sessionView: 'timeline',
    });

    useTabStore.getState().setAgentProcess('tab-codex', false, Date.now());

    expect(useTabStore.getState().tabs['tab-codex']).toMatchObject({
      agentProcess: false,
      sessionView: 'timeline',
    });
  });

  it('keeps the session list open when a Codex process is detected', () => {
    useTabStore.getState().initTab('tab-sessions', {
      workspaceId: 'ws-test',
      panelType: 'codex',
      agentProcess: false,
      sessionView: 'session-list',
    });

    useTabStore.getState().setAgentProcess('tab-sessions', true, Date.now());

    expect(useTabStore.getState().tabs['tab-sessions']).toMatchObject({
      agentProcess: true,
      sessionView: 'session-list',
    });
  });

  it('moves the check view to timeline when a Codex process is detected', () => {
    useTabStore.getState().initTab('tab-check', {
      workspaceId: 'ws-test',
      panelType: 'codex',
      agentProcess: false,
      sessionView: 'check',
    });

    useTabStore.getState().setAgentProcess('tab-check', true, Date.now());

    expect(useTabStore.getState().tabs['tab-check']).toMatchObject({
      agentProcess: true,
      sessionView: 'timeline',
    });
  });

  it('updates agent process and install fields directly', () => {
    useTabStore.getState().initTab('tab-partial', {
      workspaceId: 'ws-test',
      panelType: 'codex',
      agentProcess: true,
      agentInstalled: false,
    });

    useTabStore.getState().setAgentProcess('tab-partial', true, 456);
    useTabStore.getState().setAgentInstalled('tab-partial', false);

    expect(useTabStore.getState().tabs['tab-partial']).toMatchObject({
      agentProcess: true,
      agentProcessCheckedAt: 456,
      agentInstalled: false,
    });
  });

  it('moves a stale timeline-only tab to the session list when switching into Codex mode', () => {
    useTabStore.getState().initTab('tab-terminal', {
      workspaceId: 'ws-test',
      panelType: 'terminal',
      agentProcess: null,
      agentSessionId: null,
      sessionView: 'timeline',
    });

    useTabStore.getState().setPanelType('tab-terminal', 'codex');

    expect(useTabStore.getState().tabs['tab-terminal']).toMatchObject({
      panelType: 'codex',
      sessionView: 'session-list',
    });
  });

  it('keeps active Codex session views when switching into Codex mode', () => {
    useTabStore.getState().initTab('tab-active', {
      workspaceId: 'ws-test',
      panelType: 'terminal',
      agentProcess: true,
      sessionView: 'timeline',
    });
    useTabStore.getState().initTab('tab-check', {
      workspaceId: 'ws-test',
      panelType: 'terminal',
      agentProcess: null,
      sessionView: 'check',
    });

    useTabStore.getState().setPanelType('tab-active', 'codex');
    useTabStore.getState().setPanelType('tab-check', 'codex');

    expect(useTabStore.getState().tabs['tab-active']?.sessionView).toBe('timeline');
    expect(useTabStore.getState().tabs['tab-check']?.sessionView).toBe('check');
  });
});
