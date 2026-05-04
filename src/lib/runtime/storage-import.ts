import type { TRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { ILayoutData, IPaneNode, ISplitNode, ITab, IWorkspacesData, TLayoutNode, TPanelType, TRuntimeVersion } from '@/types/terminal';

export interface IImportLegacyStorageSnapshotInput {
  workspacesData: IWorkspacesData;
  layoutsByWorkspaceId: Record<string, ILayoutData | null | undefined>;
  importedAt?: string;
}

export interface IImportLegacyStorageSnapshotResult {
  importedGroupCount: number;
  importedWorkspaceCount: number;
  importedPaneCount: number;
  importedSplitPaneCount: number;
  importedTabCount: number;
  importedRuntimeV1TabCount: number;
  importedRuntimeV2TabCount: number;
  importedNonTerminalTabCount: number;
  importedStatusMetadataCount: number;
  missingLayoutCount: number;
  invalidLayoutCount: number;
}

const panelTypeForImport = (panelType: TPanelType | undefined): TPanelType =>
  panelType ?? 'terminal';

const runtimeVersionForImport = (tab: ITab): TRuntimeVersion =>
  tab.runtimeVersion ?? 1;

const hasStatusMetadata = (tab: ITab): boolean =>
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

const splitIdForPath = (workspaceId: string, path: number[]): string =>
  `split-${workspaceId}-${path.length ? path.join('-') : 'root'}`;

const createEmptyResult = (): IImportLegacyStorageSnapshotResult => ({
  importedGroupCount: 0,
  importedWorkspaceCount: 0,
  importedPaneCount: 0,
  importedSplitPaneCount: 0,
  importedTabCount: 0,
  importedRuntimeV1TabCount: 0,
  importedRuntimeV2TabCount: 0,
  importedNonTerminalTabCount: 0,
  importedStatusMetadataCount: 0,
  missingLayoutCount: 0,
  invalidLayoutCount: 0,
});

const isPaneNode = (node: TLayoutNode): node is IPaneNode =>
  node.type === 'pane' && typeof node.id === 'string' && Array.isArray(node.tabs);

const isSplitNode = (node: TLayoutNode): node is ISplitNode =>
  node.type === 'split' && Array.isArray(node.children) && node.children.length === 2;

const importAgentSession = (
  db: TRuntimeDatabase,
  tab: ITab,
  ts: string,
): void => {
  if (!tab.agentSessionId) return;
  db.prepare(`
    insert into agent_sessions (
      id, provider, source, source_id, cwd, jsonl_ref, summary, created_at, updated_at
    )
    values (?, 'codex', 'legacy-layout', ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      cwd = excluded.cwd,
      jsonl_ref = excluded.jsonl_ref,
      summary = excluded.summary,
      updated_at = excluded.updated_at
  `).run(
    tab.agentSessionId,
    tab.agentSessionId,
    tab.cwd ?? null,
    tab.agentJsonlPath ?? null,
    tab.agentSummary ?? null,
    ts,
    ts,
  );
};

const importTab = (
  db: TRuntimeDatabase,
  workspaceId: string,
  paneId: string,
  tab: ITab,
  orderIndex: number,
  ts: string,
  result: IImportLegacyStorageSnapshotResult,
): void => {
  const panelType = panelTypeForImport(tab.panelType);
  const runtimeVersion = runtimeVersionForImport(tab);
  const statusMetadata = hasStatusMetadata(tab);

  importAgentSession(db, tab, ts);
  db.prepare(`
    insert into tabs (
      id, workspace_id, pane_id, session_name, panel_type, name, title, cwd,
      lifecycle_state, order_index, terminal_ratio, terminal_collapsed, web_url,
      last_command, runtime_version, created_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(id) do update set
      workspace_id = excluded.workspace_id,
      pane_id = excluded.pane_id,
      session_name = excluded.session_name,
      panel_type = excluded.panel_type,
      name = excluded.name,
      title = excluded.title,
      cwd = excluded.cwd,
      lifecycle_state = 'ready',
      order_index = excluded.order_index,
      terminal_ratio = excluded.terminal_ratio,
      terminal_collapsed = excluded.terminal_collapsed,
      web_url = excluded.web_url,
      last_command = excluded.last_command,
      runtime_version = excluded.runtime_version,
      updated_at = excluded.updated_at
  `).run(
    tab.id,
    workspaceId,
    paneId,
    tab.sessionName,
    panelType,
    tab.name ?? '',
    tab.title ?? null,
    tab.cwd ?? null,
    orderIndex,
    tab.terminalRatio ?? null,
    tab.terminalCollapsed ? 1 : 0,
    tab.webUrl ?? null,
    tab.lastCommand ?? null,
    runtimeVersion,
    ts,
    ts,
  );

  db.prepare(`
    insert into tab_status (
      tab_id, cli_state, pane_title, agent_session_id, agent_jsonl_ref,
      agent_summary, last_user_message, dismissed_at, updated_at
    )
    values (?, ?, ?, ?, ?, ?, ?, ?, ?)
    on conflict(tab_id) do update set
      cli_state = excluded.cli_state,
      pane_title = excluded.pane_title,
      agent_session_id = excluded.agent_session_id,
      agent_jsonl_ref = excluded.agent_jsonl_ref,
      agent_summary = excluded.agent_summary,
      last_user_message = excluded.last_user_message,
      dismissed_at = excluded.dismissed_at,
      updated_at = excluded.updated_at
  `).run(
    tab.id,
    tab.cliState ?? 'inactive',
    tab.title ?? null,
    tab.agentSessionId ?? null,
    tab.agentJsonlPath ?? null,
    tab.agentSummary ?? null,
    tab.lastUserMessage ?? null,
    tab.dismissedAt ?? null,
    ts,
  );

  result.importedTabCount += 1;
  if (panelType === 'terminal') {
    if (runtimeVersion === 2) result.importedRuntimeV2TabCount += 1;
    else result.importedRuntimeV1TabCount += 1;
  } else {
    result.importedNonTerminalTabCount += 1;
  }
  if (statusMetadata) result.importedStatusMetadataCount += 1;
};

const importNode = (
  db: TRuntimeDatabase,
  workspaceId: string,
  node: TLayoutNode,
  parentId: string | null,
  position: number,
  path: number[],
  ts: string,
  result: IImportLegacyStorageSnapshotResult,
): string | null => {
  if (isPaneNode(node)) {
    db.prepare(`
      insert into panes (id, workspace_id, parent_id, node_kind, position, active_tab_id, created_at, updated_at)
      values (?, ?, ?, 'pane', ?, null, ?, ?)
      on conflict(id) do update set
        workspace_id = excluded.workspace_id,
        parent_id = excluded.parent_id,
        node_kind = 'pane',
        split_axis = null,
        ratio = null,
        position = excluded.position,
        active_tab_id = null,
        updated_at = excluded.updated_at
    `).run(node.id, workspaceId, parentId, position, ts, ts);
    result.importedPaneCount += 1;
    node.tabs.forEach((tab, index) => importTab(db, workspaceId, node.id, tab, index, ts, result));
    db.prepare(`update panes set active_tab_id = ?, updated_at = ? where id = ?`)
      .run(node.activeTabId, ts, node.id);
    return node.id;
  }

  if (isSplitNode(node)) {
    const splitId = splitIdForPath(workspaceId, path);
    db.prepare(`
      insert into panes (id, workspace_id, parent_id, node_kind, split_axis, ratio, position, created_at, updated_at)
      values (?, ?, ?, 'split', ?, ?, ?, ?, ?)
      on conflict(id) do update set
        workspace_id = excluded.workspace_id,
        parent_id = excluded.parent_id,
        node_kind = 'split',
        split_axis = excluded.split_axis,
        ratio = excluded.ratio,
        position = excluded.position,
        active_tab_id = null,
        updated_at = excluded.updated_at
    `).run(splitId, workspaceId, parentId, node.orientation, node.ratio, position, ts, ts);
    result.importedSplitPaneCount += 1;
    importNode(db, workspaceId, node.children[0], splitId, 0, [...path, 0], ts, result);
    importNode(db, workspaceId, node.children[1], splitId, 1, [...path, 1], ts, result);
    return splitId;
  }

  result.invalidLayoutCount += 1;
  return null;
};

export const importLegacyStorageSnapshot = (
  db: TRuntimeDatabase,
  {
    workspacesData,
    layoutsByWorkspaceId,
    importedAt = new Date().toISOString(),
  }: IImportLegacyStorageSnapshotInput,
): IImportLegacyStorageSnapshotResult => {
  const result = createEmptyResult();
  const groups = workspacesData.groups ?? [];
  const importTx = db.transaction(() => {
    groups.forEach((group, index) => {
      db.prepare(`
        insert into workspace_groups (id, name, collapsed, order_index, created_at, updated_at)
        values (?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          name = excluded.name,
          collapsed = excluded.collapsed,
          order_index = excluded.order_index,
          updated_at = excluded.updated_at
      `).run(group.id, group.name, group.collapsed ? 1 : 0, index, importedAt, importedAt);
      result.importedGroupCount += 1;
    });

    workspacesData.workspaces.forEach((workspace, index) => {
      const layout = layoutsByWorkspaceId[workspace.id];
      if (!layout) {
        result.missingLayoutCount += 1;
        return;
      }
      const defaultCwd = workspace.directories[0] ?? '';
      db.prepare(`
        insert into workspaces (
          id, name, default_cwd, active, group_id, order_index, active_pane_id, created_at, updated_at
        )
        values (?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(id) do update set
          name = excluded.name,
          default_cwd = excluded.default_cwd,
          active = excluded.active,
          group_id = excluded.group_id,
          order_index = excluded.order_index,
          active_pane_id = excluded.active_pane_id,
          updated_at = excluded.updated_at
      `).run(
        workspace.id,
        workspace.name,
        defaultCwd,
        workspacesData.activeWorkspaceId === workspace.id ? 1 : 0,
        workspace.groupId ?? null,
        index,
        layout.activePaneId,
        importedAt,
        importedAt,
      );
      result.importedWorkspaceCount += 1;
      importNode(db, workspace.id, layout.root, null, 0, [], importedAt, result);
    });
  });

  importTx();
  return result;
};
