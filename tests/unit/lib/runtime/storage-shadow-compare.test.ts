import { describe, expect, it } from 'vitest';
import {
  collectRuntimeStorageShadowTabs,
  compareRuntimeStorageShadowTabs,
} from '@/lib/runtime/storage-shadow-compare';
import type { ILayoutData } from '@/types/terminal';

const legacyLayout: ILayoutData = {
  root: {
    type: 'split',
    orientation: 'horizontal',
    ratio: 50,
    children: [
      {
        type: 'pane',
        id: 'pane-a',
        activeTabId: 'tab-v2',
        tabs: [
          {
            id: 'tab-v1',
            sessionName: 'pt-ws-a-pane-a-tab-v1',
            name: '',
            order: 0,
            runtimeVersion: 1,
            cwd: '/secret/project',
          },
          {
            id: 'tab-v2',
            sessionName: 'rtv2-ws-a-pane-a-tab-v2',
            name: '',
            order: 1,
            panelType: 'terminal',
            runtimeVersion: 2,
            cwd: '/secret/project',
          },
        ],
      },
      {
        type: 'pane',
        id: 'pane-b',
        activeTabId: 'tab-web',
        tabs: [
          {
            id: 'tab-web',
            sessionName: 'web-tab',
            name: 'Docs',
            order: 0,
            panelType: 'web-browser',
          },
        ],
      },
    ],
  },
  activePaneId: 'pane-a',
  updatedAt: 'now',
};

const runtimeLayout: ILayoutData = {
  root: {
    type: 'pane',
    id: 'pane-a',
    activeTabId: 'tab-v2',
    tabs: [
      {
        id: 'tab-v2',
        sessionName: 'rtv2-ws-a-pane-a-tab-v2',
        name: '',
        order: 1,
        panelType: 'terminal',
        runtimeVersion: 2,
        cwd: '/secret/project',
      },
    ],
  },
  activePaneId: 'pane-a',
  updatedAt: 'now',
};

describe('runtime v2 storage shadow compare', () => {
  it('compares mirrored runtime v2 tabs and ignores legacy-only tabs', () => {
    const legacyTabs = collectRuntimeStorageShadowTabs({
      workspaceId: 'ws-a',
      layout: legacyLayout,
      runtimeVersion: 2,
    });
    const runtimeTabs = collectRuntimeStorageShadowTabs({
      workspaceId: 'ws-a',
      layout: runtimeLayout,
    });

    expect(legacyTabs).toEqual([
      {
        workspaceId: 'ws-a',
        paneId: 'pane-a',
        tabId: 'tab-v2',
        sessionName: 'rtv2-ws-a-pane-a-tab-v2',
        order: 0,
        panelType: 'terminal',
        runtimeVersion: 2,
        hasCwd: true,
      },
    ]);
    expect(compareRuntimeStorageShadowTabs(legacyTabs, runtimeTabs)).toEqual({
      ok: true,
      mismatches: [],
    });
  });

  it('reports missing, extra, and field mismatches without exposing cwd values', () => {
    const legacyTabs = collectRuntimeStorageShadowTabs({
      workspaceId: 'ws-a',
      layout: runtimeLayout,
    });
    const runtimeTabs = collectRuntimeStorageShadowTabs({
      workspaceId: 'ws-a',
      layout: {
        ...runtimeLayout,
        root: {
          type: 'pane',
          id: 'pane-a',
          activeTabId: 'tab-extra',
          tabs: [
            {
              id: 'tab-v2',
              sessionName: 'rtv2-ws-a-pane-a-tab-v2-recreated',
              name: '',
              order: 2,
              panelType: 'terminal',
              runtimeVersion: 2,
            },
            {
              id: 'tab-extra',
              sessionName: 'rtv2-ws-a-pane-a-tab-extra',
              name: '',
              order: 3,
              panelType: 'terminal',
              runtimeVersion: 2,
            },
          ],
        },
      },
    });

    const result = compareRuntimeStorageShadowTabs(legacyTabs, runtimeTabs);

    expect(result.ok).toBe(false);
    expect(result.mismatches).toEqual([
      { type: 'field-mismatch', tabId: 'tab-v2', field: 'sessionName' },
      { type: 'field-mismatch', tabId: 'tab-v2', field: 'hasCwd', expected: true, actual: false },
      { type: 'extra-runtime-tab', tabId: 'tab-extra' },
    ]);
    expect(JSON.stringify(result)).not.toContain('/secret/project');
  });
});
