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
});
