#!/usr/bin/env tsx
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { importLegacyStorageSnapshot } from '@/lib/runtime/storage-import';
import { createStorageRepository } from '@/lib/runtime/storage/repository';
import { openRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const main = async (): Promise<void> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'codexmux-runtime-v2-storage-import-'));
  try {
    const db = openRuntimeDatabase(path.join(root, 'runtime-v2', 'state.db'));
    const workspacesData: IWorkspacesData = {
      groups: [{ id: 'group-smoke', name: 'Import Secret Group', collapsed: true }],
      activeWorkspaceId: 'ws-smoke',
      sidebarCollapsed: true,
      sidebarWidth: 320,
      updatedAt: '2026-05-04T00:00:00.000Z',
      workspaces: [
        {
          id: 'ws-smoke',
          name: 'Import Secret Workspace',
          directories: ['/secret/import'],
          groupId: 'group-smoke',
        },
      ],
    };
    const layout: ILayoutData = {
      root: {
        type: 'split',
        orientation: 'vertical',
        ratio: 45,
        children: [
          {
            type: 'pane',
            id: 'pane-import-a',
            activeTabId: 'tab-import-v1',
            tabs: [
              {
                id: 'tab-import-v1',
                sessionName: 'pt-secret-import-session',
                name: 'Import Secret Terminal',
                order: 0,
                cwd: '/secret/import',
                panelType: 'terminal',
                runtimeVersion: 1,
                cliState: 'needs-input',
                lastUserMessage: 'import secret prompt',
              },
            ],
          },
          {
            type: 'pane',
            id: 'pane-import-b',
            activeTabId: 'tab-import-web',
            tabs: [
              {
                id: 'tab-import-web',
                sessionName: 'web-secret-import-session',
                name: 'Import Secret Web',
                order: 0,
                panelType: 'web-browser',
                webUrl: 'https://secret.example.test/import',
              },
              {
                id: 'tab-import-v2',
                sessionName: 'rtv2-ws-smoke-pane-import-b-tab-import-v2',
                name: 'Import Secret v2',
                order: 1,
                cwd: '/secret/import',
                panelType: 'terminal',
                runtimeVersion: 2,
              },
            ],
          },
        ],
      },
      activePaneId: 'pane-import-b',
      updatedAt: '2026-05-04T00:00:00.000Z',
    };

    const result = importLegacyStorageSnapshot(db, {
      workspacesData,
      layoutsByWorkspaceId: { 'ws-smoke': layout },
      importedAt: '2026-05-04T00:00:00.000Z',
    });
    importLegacyStorageSnapshot(db, {
      workspacesData,
      layoutsByWorkspaceId: { 'ws-smoke': layout },
      importedAt: '2026-05-04T00:01:00.000Z',
    });

    const repo = createStorageRepository(db);
    const importedLayout = repo.getWorkspaceLayout('ws-smoke');
    assert(result.importedWorkspaceCount === 1, 'workspace import count mismatch');
    assert(result.importedSplitPaneCount === 1, 'split import count mismatch');
    assert(result.importedRuntimeV1TabCount === 1, 'runtime v1 terminal import count mismatch');
    assert(result.importedRuntimeV2TabCount === 1, 'runtime v2 terminal import count mismatch');
    assert(result.importedNonTerminalTabCount === 1, 'non-terminal import count mismatch');
    assert(importedLayout?.root.type === 'split', 'imported layout did not preserve split root');
    assert(repo.listReadyTerminalTabs().length === 1, 'legacy terminal tab was exposed as runtime v2 ready');
    assert(repo.getReadyTerminalTabBySession('pt-secret-import-session') === null, 'legacy terminal session was exposed to runtime v2 attach');

    const output = {
      ok: true,
      result,
      projectedRootType: importedLayout?.root.type,
      readyRuntimeV2TerminalCount: repo.listReadyTerminalTabs().length,
    };
    const serialized = JSON.stringify(output);
    assert(!serialized.includes('/secret/import'), 'import smoke output leaked a cwd');
    assert(!serialized.includes('Import Secret'), 'import smoke output leaked a label');
    assert(!serialized.includes('pt-secret-import-session'), 'import smoke output leaked a legacy session');
    assert(!serialized.includes('import secret prompt'), 'import smoke output leaked prompt text');
    console.log(JSON.stringify(output, null, 2));
    db.close();
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
