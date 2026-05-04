import { describe, expect, it } from 'vitest';
import { analyzeRuntimeStorageDryRun } from '@/lib/runtime/storage-dry-run';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

const simpleRuntimeV2Layout: ILayoutData = {
  root: {
    type: 'pane',
    id: 'pane-ready',
    activeTabId: 'tab-ready',
    tabs: [
      {
        id: 'tab-ready',
        sessionName: 'rtv2-ws-ready-pane-ready-tab-ready',
        name: 'Secret tab name',
        order: 0,
        cwd: '/secret/simple-project',
        panelType: 'terminal',
        runtimeVersion: 2,
      },
    ],
  },
  activePaneId: 'pane-ready',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

describe('runtime v2 storage dry run', () => {
  it('reports importable legacy state without exposing sensitive values', () => {
    const workspacesData: IWorkspacesData = {
      groups: [{ id: 'group-a', name: 'Secret Group', collapsed: true }],
      activeWorkspaceId: 'ws-a',
      sidebarCollapsed: true,
      sidebarWidth: 320,
      updatedAt: '2026-05-04T00:00:00.000Z',
      workspaces: [
        {
          id: 'ws-a',
          name: 'Secret Workspace',
          directories: ['/secret/project-a'],
          groupId: 'group-a',
        },
      ],
    };
    const layout: ILayoutData = {
      root: {
        type: 'split',
        orientation: 'horizontal',
        ratio: 55,
        children: [
          {
            type: 'pane',
            id: 'pane-a',
            activeTabId: 'tab-legacy',
            tabs: [
              {
                id: 'tab-legacy',
                sessionName: 'pt-secret-session',
                name: 'Secret terminal',
                title: 'Secret title',
                order: 0,
                cwd: '/secret/project-a',
                panelType: 'terminal',
                runtimeVersion: 1,
                lastUserMessage: 'secret prompt',
                agentSummary: 'secret summary',
                agentJsonlPath: '/secret/codex/session.jsonl',
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
                sessionName: 'web-secret-session',
                name: 'Secret docs',
                order: 0,
                panelType: 'web-browser',
                webUrl: 'https://secret.example.test',
              },
            ],
          },
        ],
      },
      activePaneId: 'pane-a',
      updatedAt: '2026-05-04T00:00:00.000Z',
    };

    const report = analyzeRuntimeStorageDryRun({
      workspacesData,
      layoutsByWorkspaceId: { 'ws-a': layout },
    });

    expect(report.cutoverReady).toBe(true);
    expect(report.totals).toMatchObject({
      workspaceCount: 1,
      groupCount: 1,
      paneCount: 2,
      splitPaneCount: 1,
      tabCount: 2,
      runtimeV1TabCount: 1,
      webTabCount: 1,
      statusMetadataTabCount: 1,
    });
    expect(report.issues).toEqual([]);
    expect(report.backupPlan.files).toEqual([
      { kind: 'workspaces', relativePath: 'workspaces.json' },
      { kind: 'layout', workspaceId: 'ws-a', relativePath: 'workspaces/ws-a/layout.json' },
    ]);

    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain('/secret');
    expect(serialized).not.toContain('Secret');
    expect(serialized).not.toContain('secret prompt');
    expect(serialized).not.toContain('secret summary');
    expect(serialized).not.toContain('secret.example.test');
    expect(serialized).not.toContain('pt-secret-session');
  });

  it('handles missing and invalid layouts as dry-run issues', () => {
    const workspacesData: IWorkspacesData = {
      workspaces: [
        { id: 'ws-missing', name: 'Missing', directories: ['/secret/missing'] },
        { id: 'ws-invalid', name: 'Invalid', directories: ['/secret/invalid'] },
      ],
      groups: [],
      sidebarCollapsed: false,
      sidebarWidth: 240,
      updatedAt: '2026-05-04T00:00:00.000Z',
    };

    const report = analyzeRuntimeStorageDryRun({
      workspacesData,
      layoutsByWorkspaceId: {
        'ws-invalid': { root: { type: 'unknown' } } as unknown as ILayoutData,
      },
    });

    expect(report.cutoverReady).toBe(false);
    expect(report.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'layout-missing', workspaceId: 'ws-missing' }),
      expect.objectContaining({ code: 'layout-invalid', workspaceId: 'ws-invalid' }),
    ]));
    expect(JSON.stringify(report)).not.toContain('/secret');
  });

  it('marks a runtime v2 terminal-only layout as cutover-ready', () => {
    const workspacesData: IWorkspacesData = {
      workspaces: [
        { id: 'ws-ready', name: 'Ready Workspace', directories: ['/secret/simple-project'] },
      ],
      groups: [],
      activeWorkspaceId: 'ws-ready',
      sidebarCollapsed: false,
      sidebarWidth: 240,
      updatedAt: '2026-05-04T00:00:00.000Z',
    };

    const report = analyzeRuntimeStorageDryRun({
      workspacesData,
      layoutsByWorkspaceId: { 'ws-ready': simpleRuntimeV2Layout },
    });

    expect(report.cutoverReady).toBe(true);
    expect(report.totals).toMatchObject({
      workspaceCount: 1,
      paneCount: 1,
      tabCount: 1,
      runtimeV2TabCount: 1,
      runtimeV1TabCount: 0,
      webTabCount: 0,
    });
    expect(report.issues.filter((issue) => issue.severity === 'blocker')).toEqual([]);
    expect(JSON.stringify(report)).not.toContain('/secret/simple-project');
    expect(JSON.stringify(report)).not.toContain('Secret tab name');
  });
});
