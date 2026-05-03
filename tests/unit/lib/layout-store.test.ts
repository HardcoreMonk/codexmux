import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tmuxMocks = vi.hoisted(() => ({
  createSession: vi.fn(),
}));

vi.mock('@/lib/tmux', () => ({
  createSession: tmuxMocks.createSession,
  hasSession: vi.fn(),
  killSession: vi.fn(),
  resolveExistingDir: vi.fn(async (cwd?: string) => cwd ?? os.homedir()),
  sendKeys: vi.fn(),
  workspaceSessionName: (wsId: string, paneId: string, tabId: string) => `pt-${wsId}-${paneId}-${tabId}`,
}));

vi.mock('@/lib/sync-server', () => ({
  broadcastSync: vi.fn(),
}));

import {
  addExistingTabToPane,
  createDefaultLayout,
  readLayoutFile,
  resolveLayoutDir,
  resolveLayoutFile,
  writeLayoutFile,
} from '@/lib/layout-store';

describe('layout store normalization', () => {
  beforeEach(() => {
    tmuxMocks.createSession.mockClear();
  });

  it('marks newly created legacy terminal tabs as runtime 1', async () => {
    const layout = await createDefaultLayout('ws-test', '/tmp');
    const tab = layout.root.type === 'pane' ? layout.root.tabs[0] : null;

    expect(tab).toMatchObject({
      sessionName: expect.stringMatching(/^pt-ws-test-/),
      runtimeVersion: 1,
    });
    expect(tmuxMocks.createSession).toHaveBeenCalledWith(tab?.sessionName, 80, 24, '/tmp');
  });

  it('normalizes stored panel and agent fields on read', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-layout-'));
    const filePath = path.join(dir, 'layout.json');
    await fs.writeFile(filePath, JSON.stringify({
      root: {
        type: 'pane',
        id: 'pane-test',
        activeTabId: 'tab-agent',
        tabs: [
          {
            id: 'tab-agent',
            sessionName: 'pt-ws-pane-tab',
            name: 'codex',
            order: 0,
            panelType: 'codex',
            agentSessionId: 'agent-session',
            agentJsonlPath: '/agent.jsonl',
            agentSummary: 'agent summary',
          },
          {
            id: 'tab-terminal',
            sessionName: 'pt-ws-pane-terminal',
            name: 'terminal',
            order: 1,
          },
        ],
      },
      activePaneId: 'pane-test',
      updatedAt: new Date(0).toISOString(),
    }));

    const layout = await readLayoutFile(filePath);
    const agentTab = layout?.root.type === 'pane' ? layout.root.tabs[0] : null;
    const terminalTab = layout?.root.type === 'pane' ? layout.root.tabs[1] : null;

    expect(agentTab).toMatchObject({
      panelType: 'codex',
      agentSessionId: 'agent-session',
      agentJsonlPath: '/agent.jsonl',
      agentSummary: 'agent summary',
    });
    expect(terminalTab).not.toHaveProperty('agentSessionId');
  });

  it('appends externally-created runtime v2 tabs without creating legacy tmux sessions', async () => {
    const wsId = `ws-layout-store-${process.pid}`;
    const paneId = 'pane-runtime';
    await fs.rm(resolveLayoutDir(wsId), { recursive: true, force: true });
    await fs.mkdir(resolveLayoutDir(wsId), { recursive: true });
    await writeLayoutFile({
      root: {
        type: 'pane',
        id: paneId,
        activeTabId: 'tab-existing',
        tabs: [{
          id: 'tab-existing',
          sessionName: 'pt-ws-layout-store-pane-runtime-tab-existing',
          name: '',
          order: 0,
          runtimeVersion: 1,
        }],
      },
      activePaneId: paneId,
      updatedAt: new Date(0).toISOString(),
    }, resolveLayoutFile(wsId));

    const tab = await addExistingTabToPane(wsId, paneId, {
      id: 'tab-runtime',
      sessionName: 'rtv2-ws-layout-store-pane-runtime-tab-runtime',
      name: '',
      order: 0,
      panelType: 'terminal',
      runtimeVersion: 2,
      cwd: '/tmp',
    });
    const layout = await readLayoutFile(resolveLayoutFile(wsId));

    expect(tab).toMatchObject({
      id: 'tab-runtime',
      order: 1,
      runtimeVersion: 2,
    });
    expect(layout?.root.type).toBe('pane');
    if (layout?.root.type === 'pane') {
      expect(layout.root.activeTabId).toBe('tab-runtime');
      expect(layout.root.tabs.map((item) => item.id)).toEqual(['tab-existing', 'tab-runtime']);
    }
    expect(tmuxMocks.createSession).not.toHaveBeenCalled();

    await fs.rm(resolveLayoutDir(wsId), { recursive: true, force: true });
  });
});
