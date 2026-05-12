import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import useTabStore from '@/hooks/use-tab-store';
import { useLayoutStore } from '@/hooks/use-layout';
import type { ILayoutData } from '@/types/terminal';

vi.mock('next/router', () => ({
  default: {
    pathname: '/',
    push: vi.fn(),
  },
}));

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('@/lib/i18n', () => ({
  t: (_namespace: string, key: string) => key,
}));

vi.mock('@/hooks/use-web-input', () => ({
  clearInputDraft: vi.fn(),
}));

vi.mock('@/hooks/use-workspace-store', () => ({
  default: {
    getState: () => ({
      activeWorkspaceId: 'ws-test',
      switchWorkspace: vi.fn(),
    }),
  },
}));

vi.mock('@/hooks/use-tab-metadata-store', () => ({
  default: {
    getState: () => ({
      metadata: {},
      reset: vi.fn(),
    }),
  },
}));

const createLayout = (panelType: 'terminal' | 'codex'): ILayoutData => ({
  root: {
    type: 'pane',
    id: 'pane-test',
    activeTabId: 'tab-agent',
    tabs: [{
      id: 'tab-agent',
      sessionName: 'pt-ws-test-pane-test-tab-agent',
      name: '',
      order: 0,
      panelType,
      agentSessionId: 'agent-session',
      agentJsonlPath: '/home/test/.codex/sessions/agent-session.jsonl',
    }],
  },
  activePaneId: 'pane-test',
  updatedAt: new Date(0).toISOString(),
});

describe('useLayoutStore panel type switching', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
    })));
    useTabStore.setState({
      tabs: {},
      tabOrders: {},
      statusWsConnected: false,
    });
    useLayoutStore.setState({
      layout: null,
      isLoading: false,
      error: null,
      workspaceId: 'ws-test',
      pendingFocusTabId: null,
    });
  });

  it('keeps agent metadata when switching a Codex tab to terminal mode', () => {
    useLayoutStore.setState({ layout: createLayout('codex') });
    useTabStore.getState().initTab('tab-agent', {
      workspaceId: 'ws-test',
      panelType: 'codex',
      sessionView: 'timeline',
    });

    useLayoutStore.getState().updateTabPanelType('pane-test', 'tab-agent', 'terminal');

    const pane = useLayoutStore.getState().layout?.root;
    expect(pane?.type).toBe('pane');
    if (pane?.type !== 'pane') return;
    expect(pane.tabs[0]).toMatchObject({
      panelType: 'terminal',
      agentSessionId: 'agent-session',
      agentJsonlPath: '/home/test/.codex/sessions/agent-session.jsonl',
    });
  });

  it('returns to the timeline when switching a tab with a stored agent session into Codex mode', () => {
    useLayoutStore.setState({ layout: createLayout('terminal') });
    useTabStore.getState().initTab('tab-agent', {
      workspaceId: 'ws-test',
      panelType: 'terminal',
      agentProcess: null,
      sessionView: 'timeline',
    });

    useLayoutStore.getState().updateTabPanelType('pane-test', 'tab-agent', 'codex');

    expect(useTabStore.getState().tabs['tab-agent']).toMatchObject({
      panelType: 'codex',
      sessionView: 'timeline',
    });
  });
});
