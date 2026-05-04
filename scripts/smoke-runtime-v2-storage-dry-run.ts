#!/usr/bin/env tsx
import { analyzeRuntimeStorageDryRun } from '@/lib/runtime/storage-dry-run';
import type { ILayoutData, IWorkspacesData } from '@/types/terminal';

const assert = (condition: unknown, message: string): void => {
  if (!condition) throw new Error(message);
};

const workspacesData: IWorkspacesData = {
  groups: [{ id: 'group-smoke', name: 'Dry Run Secret Group', collapsed: false }],
  activeWorkspaceId: 'ws-smoke',
  sidebarCollapsed: true,
  sidebarWidth: 300,
  updatedAt: '2026-05-04T00:00:00.000Z',
  workspaces: [
    {
      id: 'ws-smoke',
      name: 'Dry Run Secret Workspace',
      directories: ['/secret/dry-run'],
      groupId: 'group-smoke',
    },
  ],
};

const layout: ILayoutData = {
  root: {
    type: 'split',
    orientation: 'vertical',
    ratio: 50,
    children: [
      {
        type: 'pane',
        id: 'pane-smoke-a',
        activeTabId: 'tab-smoke-legacy',
        tabs: [
          {
            id: 'tab-smoke-legacy',
            sessionName: 'pt-secret-dry-run-session',
            name: 'Dry Run Secret Terminal',
            order: 0,
            cwd: '/secret/dry-run',
            runtimeVersion: 1,
            lastUserMessage: 'dry run secret prompt',
          },
        ],
      },
      {
        type: 'pane',
        id: 'pane-smoke-b',
        activeTabId: 'tab-smoke-v2',
        tabs: [
          {
            id: 'tab-smoke-v2',
            sessionName: 'rtv2-ws-smoke-pane-smoke-b-tab-smoke-v2',
            name: 'Dry Run Secret v2',
            order: 0,
            cwd: '/secret/dry-run',
            panelType: 'terminal',
            runtimeVersion: 2,
          },
        ],
      },
    ],
  },
  activePaneId: 'pane-smoke-a',
  updatedAt: '2026-05-04T00:00:00.000Z',
};

const report = analyzeRuntimeStorageDryRun({
  workspacesData,
  layoutsByWorkspaceId: { 'ws-smoke': layout },
});

const serialized = JSON.stringify(report);
assert(report.readOnly, 'dry-run report must be read-only');
assert(report.cutoverReady, 'importable fixture must be cutover-ready for storage import');
assert(report.backupPlan.files.length === 2, 'backup manifest must include workspaces and layout files');
assert(report.totals.runtimeV1TabCount === 1, 'legacy terminal tab count mismatch');
assert(report.totals.runtimeV2TabCount === 1, 'runtime v2 terminal tab count mismatch');
assert(report.issues.every((issue) => issue.severity !== 'blocker'), 'importable fixture must not have blockers');
assert(!serialized.includes('/secret'), 'report leaked a filesystem path');
assert(!serialized.includes('Dry Run Secret'), 'report leaked workspace or tab labels');
assert(!serialized.includes('dry run secret prompt'), 'report leaked prompt text');
assert(!serialized.includes('pt-secret-dry-run-session'), 'report leaked a session name');

console.log(JSON.stringify({
  ok: true,
  cutoverReady: report.cutoverReady,
  blockerCount: report.issues.filter((issue) => issue.severity === 'blocker').length,
  warningCount: report.issues.filter((issue) => issue.severity === 'warning').length,
  totals: report.totals,
  backupFileCount: report.backupPlan.files.length,
}, null, 2));
