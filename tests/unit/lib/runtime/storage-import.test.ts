import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { importLegacyStorageSnapshot } from '@/lib/runtime/storage-import';
import { createStorageRepository } from '@/lib/runtime/storage/repository';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

describe('runtime v2 storage import', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-storage-import-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('imports grouped workspaces, split panes, legacy tabs, non-terminal tabs, and status metadata idempotently', () => {
    const db = openRuntimeDatabase(path.join(dir, 'runtime-v2', 'state.db'));
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
            activeTabId: 'tab-v1',
            tabs: [
              {
                id: 'tab-v1',
                sessionName: 'pt-ws-a-pane-a-tab-v1',
                name: 'Legacy terminal',
                order: 7,
                title: 'Secret title',
                cwd: '/secret/project-a',
                panelType: 'terminal',
                runtimeVersion: 1,
                cliState: 'needs-input',
                agentSessionId: 'agent-secret',
                agentJsonlPath: '/secret/codex/session.jsonl',
                agentSummary: 'secret summary',
                lastUserMessage: 'secret prompt',
                lastCommand: 'codex',
                dismissedAt: 123,
              },
              {
                id: 'tab-v2',
                sessionName: 'rtv2-ws-a-pane-a-tab-v2',
                name: 'Runtime terminal',
                order: 8,
                cwd: '/secret/project-a',
                panelType: 'terminal',
                runtimeVersion: 2,
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
                sessionName: 'web-ws-a-pane-b-tab-web',
                name: 'Docs',
                order: 0,
                panelType: 'web-browser',
                webUrl: 'https://example.test/docs',
              },
            ],
          },
        ],
      },
      activePaneId: 'pane-b',
      updatedAt: '2026-05-04T00:00:00.000Z',
    };

    const first = importLegacyStorageSnapshot(db, {
      workspacesData,
      layoutsByWorkspaceId: { 'ws-a': layout },
      importedAt: '2026-05-04T00:00:00.000Z',
    });
    const second = importLegacyStorageSnapshot(db, {
      workspacesData,
      layoutsByWorkspaceId: { 'ws-a': layout },
      importedAt: '2026-05-04T00:01:00.000Z',
    });
    const repo = createStorageRepository(db);
    const importedLayout = repo.getWorkspaceLayout('ws-a');

    expect(first).toMatchObject({
      importedWorkspaceCount: 1,
      importedGroupCount: 1,
      importedPaneCount: 2,
      importedSplitPaneCount: 1,
      importedTabCount: 3,
      importedRuntimeV1TabCount: 1,
      importedRuntimeV2TabCount: 1,
      importedNonTerminalTabCount: 1,
      importedStatusMetadataCount: 1,
    });
    expect(second).toEqual(first);
    expect(repo.listWorkspaces()).toEqual([
      expect.objectContaining({
        id: 'ws-a',
        groupId: 'group-a',
        active: 1,
        defaultCwd: '/secret/project-a',
      }),
    ]);
    expect(importedLayout?.activePaneId).toBe('pane-b');
    expect(importedLayout?.root).toEqual({
      type: 'split',
      orientation: 'horizontal',
      ratio: 55,
      children: [
        {
          type: 'pane',
          id: 'pane-a',
          activeTabId: 'tab-v1',
          tabs: [
            expect.objectContaining({
              id: 'tab-v1',
              sessionName: 'pt-ws-a-pane-a-tab-v1',
              runtimeVersion: 1,
              panelType: 'terminal',
              cliState: 'needs-input',
              agentSessionId: 'agent-secret',
              agentJsonlPath: '/secret/codex/session.jsonl',
              agentSummary: 'secret summary',
              lastUserMessage: 'secret prompt',
              lastCommand: 'codex',
              dismissedAt: 123,
            }),
            expect.objectContaining({
              id: 'tab-v2',
              sessionName: 'rtv2-ws-a-pane-a-tab-v2',
              runtimeVersion: 2,
              panelType: 'terminal',
            }),
          ],
        },
        {
          type: 'pane',
          id: 'pane-b',
          activeTabId: 'tab-web',
          tabs: [
            expect.objectContaining({
              id: 'tab-web',
              panelType: 'web-browser',
              webUrl: 'https://example.test/docs',
              runtimeVersion: 1,
            }),
          ],
        },
      ],
    });
    expect(repo.listReadyTerminalTabs()).toEqual([
      expect.objectContaining({ id: 'tab-v2', sessionName: 'rtv2-ws-a-pane-a-tab-v2', runtimeVersion: 2 }),
    ]);
    expect(repo.getReadyTerminalTabBySession('pt-ws-a-pane-a-tab-v1')).toBeNull();
    expect(repo.deleteWorkspace({ workspaceId: 'ws-a' })).toEqual({
      deleted: true,
      sessions: [{ sessionName: 'rtv2-ws-a-pane-a-tab-v2' }],
    });
  });
});
