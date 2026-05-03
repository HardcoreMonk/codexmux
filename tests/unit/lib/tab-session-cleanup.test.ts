import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => {
  const supervisor = {
    ensureStarted: vi.fn(),
    deleteTerminalTab: vi.fn(),
  };
  return {
    killSession: vi.fn(),
    getRuntimeSupervisor: vi.fn(() => supervisor),
    supervisor,
  };
});

vi.mock('@/lib/tmux', () => ({
  killSession: mocks.killSession,
}));

vi.mock('@/lib/runtime/supervisor', () => ({
  getRuntimeSupervisor: mocks.getRuntimeSupervisor,
}));

import { cleanupTabSession } from '@/lib/tab-session-cleanup';

describe('tab session cleanup', () => {
  beforeEach(() => {
    mocks.killSession.mockClear();
    mocks.getRuntimeSupervisor.mockClear();
    mocks.supervisor.ensureStarted.mockClear();
    mocks.supervisor.deleteTerminalTab.mockClear();
  });

  it('kills legacy terminal sessions through the legacy tmux socket', async () => {
    await cleanupTabSession({
      id: 'tab-legacy',
      sessionName: 'pt-ws-a-pane-b-tab-legacy',
      runtimeVersion: 1,
    });

    expect(mocks.killSession).toHaveBeenCalledWith('pt-ws-a-pane-b-tab-legacy');
    expect(mocks.getRuntimeSupervisor).not.toHaveBeenCalled();
  });

  it('deletes runtime v2 terminal tabs through the runtime supervisor', async () => {
    await cleanupTabSession({
      id: 'tab-runtime',
      sessionName: 'rtv2-ws-a-pane-b-tab-runtime',
      panelType: 'terminal',
      runtimeVersion: 2,
    });

    expect(mocks.supervisor.ensureStarted).toHaveBeenCalled();
    expect(mocks.supervisor.deleteTerminalTab).toHaveBeenCalledWith('tab-runtime');
    expect(mocks.killSession).not.toHaveBeenCalledWith('rtv2-ws-a-pane-b-tab-runtime');
  });

  it('does not clean up web browser tabs', async () => {
    await cleanupTabSession({
      id: 'tab-web',
      sessionName: 'pt-ws-a-pane-b-tab-web',
      panelType: 'web-browser',
    });

    expect(mocks.killSession).not.toHaveBeenCalledWith('pt-ws-a-pane-b-tab-web');
    expect(mocks.getRuntimeSupervisor).not.toHaveBeenCalled();
  });
});
