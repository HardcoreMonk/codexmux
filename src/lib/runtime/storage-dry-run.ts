import type { ILayoutData, ITab, IWorkspacesData, TLayoutNode, TPanelType } from '@/types/terminal';

export type TRuntimeStorageDryRunIssueSeverity = 'blocker' | 'warning';

export type TRuntimeStorageDryRunIssueCode =
  | 'workspace-groups-not-imported'
  | 'sidebar-state-json-retained'
  | 'active-workspace-json-retained'
  | 'layout-missing'
  | 'layout-invalid'
  | 'split-layout-not-imported'
  | 'runtime-v1-tab-not-imported'
  | 'web-tab-not-imported'
  | 'non-terminal-tab-not-imported'
  | 'tab-status-metadata-not-imported';

export interface IRuntimeStorageDryRunIssue {
  code: TRuntimeStorageDryRunIssueCode;
  severity: TRuntimeStorageDryRunIssueSeverity;
  workspaceId?: string;
  paneId?: string;
  tabId?: string;
  count?: number;
}

export interface IRuntimeStorageDryRunTotals {
  workspaceCount: number;
  groupCount: number;
  groupedWorkspaceCount: number;
  paneCount: number;
  splitPaneCount: number;
  tabCount: number;
  runtimeV1TabCount: number;
  runtimeV2TabCount: number;
  webTabCount: number;
  nonTerminalTabCount: number;
  statusMetadataTabCount: number;
  missingLayoutCount: number;
  invalidLayoutCount: number;
}

export interface IRuntimeStorageDryRunCapabilities {
  hasWorkspaceGroups: boolean;
  hasSidebarState: boolean;
  hasActiveWorkspaceState: boolean;
  hasSplitLayouts: boolean;
  hasRuntimeV1Tabs: boolean;
  hasRuntimeV2Tabs: boolean;
  hasWebTabs: boolean;
  hasNonTerminalTabs: boolean;
  hasStatusMetadata: boolean;
}

export interface IRuntimeStorageDryRunBackupFile {
  kind: 'workspaces' | 'layout';
  relativePath: string;
  workspaceId?: string;
}

export interface IRuntimeStorageDryRunBackupPlan {
  source: 'legacy-json';
  target: 'runtime-v2-sqlite';
  readOnly: true;
  sqliteRelativePath: 'runtime-v2/state.db';
  files: IRuntimeStorageDryRunBackupFile[];
}

export interface IRuntimeStorageDryRunReport {
  reportVersion: 1;
  cutoverReady: boolean;
  readOnly: true;
  totals: IRuntimeStorageDryRunTotals;
  capabilities: IRuntimeStorageDryRunCapabilities;
  backupPlan: IRuntimeStorageDryRunBackupPlan;
  issues: IRuntimeStorageDryRunIssue[];
}

export interface IAnalyzeRuntimeStorageDryRunInput {
  workspacesData: IWorkspacesData;
  layoutsByWorkspaceId: Record<string, ILayoutData | null | undefined>;
}

const DEFAULT_SIDEBAR_WIDTH = 240;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isTabArray = (value: unknown): value is ITab[] =>
  Array.isArray(value) && value.every((tab) => isRecord(tab) && typeof tab.id === 'string');

const isPaneNode = (node: unknown): node is Extract<TLayoutNode, { type: 'pane' }> =>
  isRecord(node)
  && node.type === 'pane'
  && typeof node.id === 'string'
  && isTabArray(node.tabs);

const isSplitNode = (node: unknown): node is Extract<TLayoutNode, { type: 'split' }> =>
  isRecord(node)
  && node.type === 'split'
  && Array.isArray(node.children)
  && node.children.length === 2;

const panelTypeForDryRun = (panelType: TPanelType | undefined): TPanelType =>
  panelType ?? 'terminal';

const tabHasStatusMetadata = (tab: ITab): boolean =>
  Boolean(
    tab.cliState
    || tab.agentSessionId
    || tab.agentJsonlPath
    || tab.agentSummary
    || tab.lastUserMessage
    || tab.lastCommand
    || tab.title
    || tab.dismissedAt
    || tab.terminalRatio
    || tab.terminalCollapsed,
  );

const createEmptyTotals = (workspaceCount: number, groupCount: number, groupedWorkspaceCount: number): IRuntimeStorageDryRunTotals => ({
  workspaceCount,
  groupCount,
  groupedWorkspaceCount,
  paneCount: 0,
  splitPaneCount: 0,
  tabCount: 0,
  runtimeV1TabCount: 0,
  runtimeV2TabCount: 0,
  webTabCount: 0,
  nonTerminalTabCount: 0,
  statusMetadataTabCount: 0,
  missingLayoutCount: 0,
  invalidLayoutCount: 0,
});

const addIssue = (
  issues: IRuntimeStorageDryRunIssue[],
  issue: IRuntimeStorageDryRunIssue,
): void => {
  issues.push(issue);
};

const analyzeTab = ({
  workspaceId,
  paneId,
  tab,
  totals,
  issues,
}: {
  workspaceId: string;
  paneId: string;
  tab: ITab;
  totals: IRuntimeStorageDryRunTotals;
  issues: IRuntimeStorageDryRunIssue[];
}): void => {
  totals.tabCount += 1;
  const panelType = panelTypeForDryRun(tab.panelType);

  if (panelType === 'web-browser') {
    totals.webTabCount += 1;
    addIssue(issues, {
      code: 'web-tab-not-imported',
      severity: 'blocker',
      workspaceId,
      paneId,
      tabId: tab.id,
    });
  } else if (panelType !== 'terminal') {
    totals.nonTerminalTabCount += 1;
    addIssue(issues, {
      code: 'non-terminal-tab-not-imported',
      severity: 'blocker',
      workspaceId,
      paneId,
      tabId: tab.id,
    });
  } else if (tab.runtimeVersion === 2) {
    totals.runtimeV2TabCount += 1;
  } else {
    totals.runtimeV1TabCount += 1;
    addIssue(issues, {
      code: 'runtime-v1-tab-not-imported',
      severity: 'blocker',
      workspaceId,
      paneId,
      tabId: tab.id,
    });
  }

  if (tabHasStatusMetadata(tab)) {
    totals.statusMetadataTabCount += 1;
    addIssue(issues, {
      code: 'tab-status-metadata-not-imported',
      severity: 'blocker',
      workspaceId,
      paneId,
      tabId: tab.id,
    });
  }
};

const analyzeNode = ({
  workspaceId,
  node,
  totals,
  issues,
}: {
  workspaceId: string;
  node: unknown;
  totals: IRuntimeStorageDryRunTotals;
  issues: IRuntimeStorageDryRunIssue[];
}): boolean => {
  if (isPaneNode(node)) {
    totals.paneCount += 1;
    node.tabs.forEach((tab) => analyzeTab({
      workspaceId,
      paneId: node.id,
      tab,
      totals,
      issues,
    }));
    return true;
  }

  if (isSplitNode(node)) {
    totals.splitPaneCount += 1;
    addIssue(issues, {
      code: 'split-layout-not-imported',
      severity: 'blocker',
      workspaceId,
      count: 1,
    });
    const leftValid = analyzeNode({ workspaceId, node: node.children[0], totals, issues });
    const rightValid = analyzeNode({ workspaceId, node: node.children[1], totals, issues });
    return leftValid && rightValid;
  }

  return false;
};

const createCapabilities = (
  workspacesData: IWorkspacesData,
  totals: IRuntimeStorageDryRunTotals,
): IRuntimeStorageDryRunCapabilities => ({
  hasWorkspaceGroups: totals.groupCount > 0 || totals.groupedWorkspaceCount > 0,
  hasSidebarState: workspacesData.sidebarCollapsed !== false || workspacesData.sidebarWidth !== DEFAULT_SIDEBAR_WIDTH,
  hasActiveWorkspaceState: Boolean(workspacesData.activeWorkspaceId),
  hasSplitLayouts: totals.splitPaneCount > 0,
  hasRuntimeV1Tabs: totals.runtimeV1TabCount > 0,
  hasRuntimeV2Tabs: totals.runtimeV2TabCount > 0,
  hasWebTabs: totals.webTabCount > 0,
  hasNonTerminalTabs: totals.nonTerminalTabCount > 0,
  hasStatusMetadata: totals.statusMetadataTabCount > 0,
});

const createBackupPlan = (workspaceIds: string[]): IRuntimeStorageDryRunBackupPlan => ({
  source: 'legacy-json',
  target: 'runtime-v2-sqlite',
  readOnly: true,
  sqliteRelativePath: 'runtime-v2/state.db',
  files: [
    { kind: 'workspaces', relativePath: 'workspaces.json' },
    ...workspaceIds.map((workspaceId) => ({
      kind: 'layout' as const,
      workspaceId,
      relativePath: `workspaces/${workspaceId}/layout.json`,
    })),
  ],
});

export const analyzeRuntimeStorageDryRun = ({
  workspacesData,
  layoutsByWorkspaceId,
}: IAnalyzeRuntimeStorageDryRunInput): IRuntimeStorageDryRunReport => {
  const workspaces = Array.isArray(workspacesData.workspaces) ? workspacesData.workspaces : [];
  const groups = Array.isArray(workspacesData.groups) ? workspacesData.groups : [];
  const groupedWorkspaceCount = workspaces.filter((workspace) => Boolean(workspace.groupId)).length;
  const totals = createEmptyTotals(workspaces.length, groups.length, groupedWorkspaceCount);
  const issues: IRuntimeStorageDryRunIssue[] = [];

  if (groups.length > 0 || groupedWorkspaceCount > 0) {
    addIssue(issues, {
      code: 'workspace-groups-not-imported',
      severity: 'blocker',
      count: groups.length + groupedWorkspaceCount,
    });
  }

  if (workspacesData.sidebarCollapsed !== false || workspacesData.sidebarWidth !== DEFAULT_SIDEBAR_WIDTH) {
    addIssue(issues, {
      code: 'sidebar-state-json-retained',
      severity: 'warning',
    });
  }

  if (workspacesData.activeWorkspaceId) {
    addIssue(issues, {
      code: 'active-workspace-json-retained',
      severity: 'warning',
    });
  }

  for (const workspace of workspaces) {
    const layout = layoutsByWorkspaceId[workspace.id];
    if (!layout) {
      totals.missingLayoutCount += 1;
      addIssue(issues, {
        code: 'layout-missing',
        severity: 'blocker',
        workspaceId: workspace.id,
      });
      continue;
    }

    const valid = isRecord(layout) && analyzeNode({
      workspaceId: workspace.id,
      node: layout.root,
      totals,
      issues,
    });
    if (!valid) {
      totals.invalidLayoutCount += 1;
      addIssue(issues, {
        code: 'layout-invalid',
        severity: 'blocker',
        workspaceId: workspace.id,
      });
    }
  }

  const capabilities = createCapabilities(workspacesData, totals);
  const cutoverReady = issues.every((issue) => issue.severity !== 'blocker');

  return {
    reportVersion: 1,
    cutoverReady,
    readOnly: true,
    totals,
    capabilities,
    backupPlan: createBackupPlan(workspaces.map((workspace) => workspace.id)),
    issues,
  };
};
