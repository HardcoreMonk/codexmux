import type {
  IRuntimeCreateWorkspaceResult,
  IRuntimeDeleteTerminalTabStorageResult,
  IRuntimeDeleteWorkspaceStorageResult,
  IRuntimeEnsureWorkspacePaneResult,
  IRuntimePendingTerminalTab,
  IRuntimeTerminalTab,
  IRuntimeWorkspace,
  IRuntimeWorkspaceTerminalSession,
  TRuntimeLayout,
} from '@/lib/runtime/contracts';
import { createRuntimeId } from '@/lib/runtime/session-name';
import type { TRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { ILayoutData, IPaneNode, ISplitNode, ITab, TLayoutNode, TRuntimeVersion } from '@/types/terminal';

export interface ICreateWorkspaceInput {
  name: string;
  defaultCwd: string;
}

export interface IEnsureWorkspacePaneInput {
  workspaceId: string;
  paneId: string;
  name: string;
  defaultCwd: string;
}

export interface ICreateTerminalTabInput {
  id: string;
  workspaceId: string;
  paneId: string;
  sessionName: string;
  cwd: string;
}

export interface IFinalizeTerminalTabInput {
  id: string;
}

export interface IFailPendingTerminalTabInput {
  id: string;
  reason: string;
}

export interface IFailReadyTerminalTabInput {
  id: string;
  reason: string;
}

export interface IDeleteWorkspaceInput {
  workspaceId: string;
}

export interface IDeleteTerminalTabInput {
  id: string;
}

export interface IMutationEventRow {
  id: string;
  entityType: string;
  entityId: string;
  eventType: string;
}

interface ITabRow {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  title: string | null;
  cwd: string | null;
  panelType: string;
  runtimeVersion: TRuntimeVersion;
  lifecycleState: string;
  webUrl: string | null;
  lastCommand: string | null;
  terminalRatio: number | null;
  terminalCollapsed: number;
  cliState: ITab['cliState'] | null;
  agentSessionId: string | null;
  agentJsonlPath: string | null;
  agentSummary: string | null;
  lastUserMessage: string | null;
  dismissedAt: number | null;
}

interface IPaneRow {
  id: string;
  parentId: string | null;
  nodeKind: 'pane' | 'split';
  splitAxis: 'horizontal' | 'vertical' | null;
  ratio: number | null;
  position: number;
  activeTabId: string | null;
}

const nowIso = (): string => new Date().toISOString();
const wsId = (): string => createRuntimeId('ws');
const paneId = (): string => createRuntimeId('pane');
const eventId = (): string => createRuntimeId('evt');

const pendingTabNotFoundError = (id: string): Error =>
  Object.assign(new Error(`pending terminal tab not found: ${id}`), {
    code: 'runtime-v2-pending-tab-not-found',
    retryable: false,
  });

const readyTabNotFoundError = (id: string): Error =>
  Object.assign(new Error(`ready terminal tab not found: ${id}`), {
    code: 'runtime-v2-ready-tab-not-found',
    retryable: false,
  });

export const createStorageRepository = (db: TRuntimeDatabase) => {
  const appendMutationEvent = db.prepare(`
    insert into mutation_events (id, command_id, actor, entity_type, entity_id, event_type, payload_json, created_at)
    values (@id, @commandId, @actor, @entityType, @entityId, @eventType, @payloadJson, @createdAt)
  `);

  const recordEvent = (entityType: string, entityId: string, eventType: string, payload: unknown): void => {
    appendMutationEvent.run({
      id: eventId(),
      commandId: null,
      actor: 'runtime-v2',
      entityType,
      entityId,
      eventType,
      payloadJson: JSON.stringify(payload),
      createdAt: nowIso(),
    });
  };

  const createWorkspaceTx = db.transaction((input: ICreateWorkspaceInput): IRuntimeCreateWorkspaceResult => {
    const workspaceId = wsId();
    const rootPaneId = paneId();
    const ts = nowIso();

    db.prepare(`
      insert into workspaces (id, name, default_cwd, active, order_index, active_pane_id, created_at, updated_at)
      values (?, ?, ?, 1, 0, ?, ?, ?)
    `).run(workspaceId, input.name, input.defaultCwd, rootPaneId, ts, ts);

    db.prepare(`
      insert into panes (id, workspace_id, node_kind, position, created_at, updated_at)
      values (?, ?, 'pane', 0, ?, ?)
    `).run(rootPaneId, workspaceId, ts, ts);

    recordEvent('workspace', workspaceId, 'workspace.created', input);
    return { id: workspaceId, rootPaneId };
  });

  const ensureWorkspacePaneTx = db.transaction((input: IEnsureWorkspacePaneInput): IRuntimeEnsureWorkspacePaneResult => {
    const ts = nowIso();
    const workspace = db.prepare(`select id from workspaces where id = ?`)
      .get(input.workspaceId) as { id: string } | undefined;
    if (!workspace) {
      const nextOrder = (db.prepare(`
        select coalesce(max(order_index), -1) + 1 as nextOrder
        from workspaces
      `).get() as { nextOrder: number }).nextOrder;
      db.prepare(`
        insert into workspaces (id, name, default_cwd, active, order_index, active_pane_id, created_at, updated_at)
        values (?, ?, ?, 0, ?, ?, ?, ?)
      `).run(input.workspaceId, input.name, input.defaultCwd, nextOrder, input.paneId, ts, ts);
    }

    const pane = db.prepare(`
      select workspace_id as workspaceId
      from panes
      where id = ?
    `).get(input.paneId) as { workspaceId: string } | undefined;
    if (pane && pane.workspaceId !== input.workspaceId) {
      throw Object.assign(new Error(`runtime v2 pane does not belong to workspace: ${input.paneId}`), {
        code: 'runtime-v2-pane-workspace-mismatch',
        retryable: false,
      });
    }
    if (!pane) {
      db.prepare(`
        insert into panes (id, workspace_id, node_kind, position, created_at, updated_at)
        values (?, ?, 'pane', 0, ?, ?)
      `).run(input.paneId, input.workspaceId, ts, ts);
    }

    recordEvent('workspace', input.workspaceId, 'workspace.ensure-pane', input);
    return { workspaceId: input.workspaceId, paneId: input.paneId };
  });

  const createPendingTerminalTabTx = db.transaction((input: ICreateTerminalTabInput): IRuntimePendingTerminalTab => {
    const ts = nowIso();
    const pane = db.prepare(`
      select workspace_id as workspaceId
      from panes
      where id = ?
    `).get(input.paneId) as { workspaceId: string } | undefined;
    if (!pane) {
      throw Object.assign(new Error(`runtime v2 pane not found: ${input.paneId}`), {
        code: 'runtime-v2-pane-not-found',
        retryable: false,
      });
    }
    if (pane.workspaceId !== input.workspaceId) {
      throw Object.assign(new Error(`runtime v2 pane does not belong to workspace: ${input.paneId}`), {
        code: 'runtime-v2-pane-workspace-mismatch',
        retryable: false,
      });
    }
    const nextOrder = (db.prepare(`
      select coalesce(max(order_index), -1) + 1 as nextOrder
      from tabs
      where pane_id = ?
    `).get(input.paneId) as { nextOrder: number }).nextOrder;

    db.prepare(`
      insert into tabs (id, workspace_id, pane_id, session_name, panel_type, name, cwd, lifecycle_state, order_index, created_at, updated_at)
      values (?, ?, ?, ?, 'terminal', '', ?, 'pending_terminal', ?, ?, ?)
    `).run(input.id, input.workspaceId, input.paneId, input.sessionName, input.cwd, nextOrder, ts, ts);

    recordEvent('tab', input.id, 'tab.create-pending', input);
    return {
      id: input.id,
      sessionName: input.sessionName,
      workspaceId: input.workspaceId,
      paneId: input.paneId,
      cwd: input.cwd,
      runtimeVersion: 2,
      lifecycleState: 'pending_terminal',
      createdAt: ts,
    };
  });

  const finalizeTerminalTabTx = db.transaction((input: IFinalizeTerminalTabInput): IRuntimeTerminalTab => {
    const ts = nowIso();
    const row = db.prepare(`
      select id, workspace_id as workspaceId, pane_id as paneId, session_name as sessionName, cwd, order_index as "order"
      from tabs
      where id = ? and lifecycle_state = 'pending_terminal'
    `).get(input.id) as { id: string; workspaceId: string; paneId: string; sessionName: string; cwd: string | null; order: number } | undefined;
    if (!row) throw pendingTabNotFoundError(input.id);

    db.prepare(`update tabs set lifecycle_state = 'ready', updated_at = ? where id = ?`)
      .run(ts, input.id);

    db.prepare(`update panes set active_tab_id = ?, updated_at = ? where id = ?`)
      .run(input.id, ts, row.paneId);

    db.prepare(`insert into tab_status (tab_id, cli_state, updated_at) values (?, 'inactive', ?)`)
      .run(input.id, ts);

    recordEvent('tab', input.id, 'tab.created', row);
    return {
      id: input.id,
      sessionName: row.sessionName,
      name: '',
      order: row.order,
      ...(row.cwd ? { cwd: row.cwd } : {}),
      panelType: 'terminal',
      runtimeVersion: 2,
      lifecycleState: 'ready',
    };
  });

  const failPendingTerminalTabTx = db.transaction((input: IFailPendingTerminalTabInput): void => {
    const ts = nowIso();
    const result = db.prepare(`
      update tabs
      set lifecycle_state = 'failed', failure_reason = ?, updated_at = ?
      where id = ? and lifecycle_state = 'pending_terminal'
    `).run(input.reason, ts, input.id);
    if (result.changes !== 1) throw pendingTabNotFoundError(input.id);
    recordEvent('tab', input.id, 'tab.create-failed', input);
  });

  const failReadyTerminalTabTx = db.transaction((input: IFailReadyTerminalTabInput): void => {
    const ts = nowIso();
    const result = db.prepare(`
      update tabs
      set lifecycle_state = 'failed', failure_reason = ?, updated_at = ?
      where id = ? and lifecycle_state = 'ready'
    `).run(input.reason, ts, input.id);
    if (result.changes !== 1) throw readyTabNotFoundError(input.id);
    recordEvent('tab', input.id, 'tab.ready-reconciliation-failed', input);
  });

  const deleteWorkspaceTx = db.transaction((input: IDeleteWorkspaceInput): IRuntimeDeleteWorkspaceStorageResult => {
    const workspace = db.prepare(`select 1 as present from workspaces where id = ?`)
      .get(input.workspaceId) as { present: number } | undefined;
    if (!workspace) return { deleted: false, sessions: [] };

    const sessions = db.prepare(`
      select session_name as sessionName
      from tabs
      where workspace_id = ? and session_name is not null
        and runtime_version = 2
        and lifecycle_state in ('pending_terminal', 'ready')
      order by created_at asc, order_index asc, id asc
    `).all(input.workspaceId) as IRuntimeWorkspaceTerminalSession[];
    const result = db.prepare(`delete from workspaces where id = ?`).run(input.workspaceId);
    if (result.changes === 0) return { deleted: false, sessions: [] };
    recordEvent('workspace', input.workspaceId, 'workspace.deleted', input);
    return { deleted: true, sessions };
  });

  const deleteTerminalTabTx = db.transaction((input: IDeleteTerminalTabInput): IRuntimeDeleteTerminalTabStorageResult => {
    const ts = nowIso();
    const row = db.prepare(`
      select id, pane_id as paneId, session_name as sessionName, panel_type as panelType,
        runtime_version as runtimeVersion, lifecycle_state as lifecycleState
      from tabs
      where id = ?
    `).get(input.id) as {
      id: string;
      paneId: string;
      sessionName: string;
      panelType: string;
      runtimeVersion: TRuntimeVersion;
      lifecycleState: string;
    } | undefined;
    if (!row) return { deleted: false, session: null };

    db.prepare(`delete from tabs where id = ?`).run(input.id);

    const remaining = db.prepare(`
      select id
      from tabs
      where pane_id = ?
      order by order_index asc, created_at asc, id asc
    `).all(row.paneId) as Array<{ id: string }>;
    remaining.forEach((tab, index) => {
      db.prepare(`update tabs set order_index = ?, updated_at = ? where id = ?`)
        .run(index, ts, tab.id);
    });

    const active = db.prepare(`
      select id
      from tabs
      where pane_id = ? and lifecycle_state = 'ready'
      order by order_index asc, created_at asc, id asc
      limit 1
    `).get(row.paneId) as { id: string } | undefined;
    db.prepare(`update panes set active_tab_id = ?, updated_at = ? where id = ?`)
      .run(active?.id ?? null, ts, row.paneId);

    recordEvent('tab', input.id, 'tab.deleted', {
      id: input.id,
      sessionName: row.sessionName,
      lifecycleState: row.lifecycleState,
    });

    const shouldKill = row.panelType === 'terminal'
      && row.runtimeVersion === 2
      && ['pending_terminal', 'ready'].includes(row.lifecycleState);
    return {
      deleted: true,
      session: shouldKill ? { sessionName: row.sessionName } : null,
    };
  });

  return {
    createWorkspace: createWorkspaceTx,
    ensureWorkspacePane: ensureWorkspacePaneTx,
    createPendingTerminalTab: createPendingTerminalTabTx,
    finalizeTerminalTab: finalizeTerminalTabTx,
    failPendingTerminalTab: failPendingTerminalTabTx,
    failReadyTerminalTab: failReadyTerminalTabTx,
    deleteWorkspace: deleteWorkspaceTx,
    deleteTerminalTab: deleteTerminalTabTx,

    listPendingTerminalTabs(): IRuntimePendingTerminalTab[] {
      return db.prepare(`
        select id, session_name as sessionName, workspace_id as workspaceId, pane_id as paneId, cwd, lifecycle_state as lifecycleState, created_at as createdAt
        from tabs
        where lifecycle_state = 'pending_terminal'
        order by created_at asc, order_index asc, id asc
      `).all() as IRuntimePendingTerminalTab[];
    },

    listReadyTerminalTabs(): IRuntimeTerminalTab[] {
      const rows = db.prepare(`
        select id, session_name as sessionName, name, title, order_index as "order", cwd,
          panel_type as panelType, runtime_version as runtimeVersion, lifecycle_state as lifecycleState,
          web_url as webUrl, last_command as lastCommand, terminal_ratio as terminalRatio,
          terminal_collapsed as terminalCollapsed,
          null as cliState, null as agentSessionId, null as agentJsonlPath, null as agentSummary,
          null as lastUserMessage, null as dismissedAt
        from tabs
        where panel_type = 'terminal' and lifecycle_state = 'ready' and runtime_version = 2
        order by created_at asc, order_index asc, id asc
      `).all() as ITabRow[];
      return rows.map((row) => ({
        id: row.id,
        sessionName: row.sessionName,
        name: row.name,
        order: row.order,
        ...(row.cwd ? { cwd: row.cwd } : {}),
        panelType: 'terminal',
        runtimeVersion: 2,
        lifecycleState: 'ready',
      }));
    },

    getReadyTerminalTabBySession(sessionName: string): IRuntimeTerminalTab | null {
      const row = db.prepare(`
        select id, session_name as sessionName, name, title, order_index as "order", cwd,
          panel_type as panelType, runtime_version as runtimeVersion, lifecycle_state as lifecycleState,
          web_url as webUrl, last_command as lastCommand, terminal_ratio as terminalRatio,
          terminal_collapsed as terminalCollapsed,
          null as cliState, null as agentSessionId, null as agentJsonlPath, null as agentSummary,
          null as lastUserMessage, null as dismissedAt
        from tabs
        where session_name = ? and panel_type = 'terminal' and lifecycle_state = 'ready' and runtime_version = 2
      `).get(sessionName) as ITabRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        sessionName: row.sessionName,
        name: row.name,
        order: row.order,
        ...(row.cwd ? { cwd: row.cwd } : {}),
        panelType: 'terminal',
        runtimeVersion: 2,
        lifecycleState: 'ready',
      };
    },

    getWorkspaceLayout(workspaceId: string): TRuntimeLayout {
      const workspace = db.prepare(`
        select active_pane_id as activePaneId
        from workspaces
        where id = ?
      `).get(workspaceId) as { activePaneId: string | null } | undefined;
      if (!workspace) return null;

      const panes = db.prepare(`
        select id, parent_id as parentId, node_kind as nodeKind, split_axis as splitAxis,
          ratio, position, active_tab_id as activeTabId
        from panes
        where workspace_id = ?
        order by parent_id asc, position asc, created_at asc, id asc
      `).all(workspaceId) as IPaneRow[];
      const rootPane = panes.find((pane) => pane.parentId === null);
      if (!rootPane) return null;

      const tabsByPaneId = new Map<string, ITab[]>();
      const tabRows = db.prepare(`
        select
          t.id,
          t.session_name as sessionName,
          t.name,
          t.title,
          t.order_index as "order",
          t.cwd,
          t.panel_type as panelType,
          t.runtime_version as runtimeVersion,
          t.lifecycle_state as lifecycleState,
          t.web_url as webUrl,
          t.last_command as lastCommand,
          t.terminal_ratio as terminalRatio,
          t.terminal_collapsed as terminalCollapsed,
          s.cli_state as cliState,
          s.agent_session_id as agentSessionId,
          s.agent_jsonl_ref as agentJsonlPath,
          s.agent_summary as agentSummary,
          s.last_user_message as lastUserMessage,
          s.dismissed_at as dismissedAt,
          t.pane_id as paneId
        from tabs t
        left join tab_status s on s.tab_id = t.id
        where t.workspace_id = ? and t.lifecycle_state = 'ready'
        order by t.pane_id asc, t.order_index asc, t.created_at asc, t.id asc
      `).all(workspaceId) as Array<ITabRow & { paneId: string }>;
      for (const row of tabRows) {
        const tab: ITab = {
          id: row.id,
          sessionName: row.sessionName,
          name: row.name,
          order: row.order,
          runtimeVersion: row.runtimeVersion,
          ...(row.title ? { title: row.title } : {}),
          ...(row.cwd ? { cwd: row.cwd } : {}),
          ...(row.panelType ? { panelType: row.panelType as ITab['panelType'] } : {}),
          ...(row.webUrl ? { webUrl: row.webUrl } : {}),
          ...(row.lastCommand ? { lastCommand: row.lastCommand } : {}),
          ...(row.terminalRatio !== null ? { terminalRatio: row.terminalRatio } : {}),
          ...(row.terminalCollapsed ? { terminalCollapsed: Boolean(row.terminalCollapsed) } : {}),
          ...(row.cliState ? { cliState: row.cliState } : {}),
          ...(row.agentSessionId ? { agentSessionId: row.agentSessionId } : {}),
          ...(row.agentJsonlPath ? { agentJsonlPath: row.agentJsonlPath } : {}),
          ...(row.agentSummary ? { agentSummary: row.agentSummary } : {}),
          ...(row.lastUserMessage ? { lastUserMessage: row.lastUserMessage } : {}),
          ...(row.dismissedAt !== null ? { dismissedAt: row.dismissedAt } : {}),
        };
        tabsByPaneId.set(row.paneId, [...(tabsByPaneId.get(row.paneId) ?? []), tab]);
      }

      const childrenByParentId = new Map<string, IPaneRow[]>();
      for (const pane of panes) {
        if (!pane.parentId) continue;
        childrenByParentId.set(pane.parentId, [...(childrenByParentId.get(pane.parentId) ?? []), pane]);
      }

      const buildNode = (row: IPaneRow): TLayoutNode => {
        if (row.nodeKind === 'pane') {
          return {
            type: 'pane',
            id: row.id,
            activeTabId: row.activeTabId,
            tabs: tabsByPaneId.get(row.id) ?? [],
          };
        }

        const children = (childrenByParentId.get(row.id) ?? []).sort((a, b) => a.position - b.position);
        const fallbackPane = (): IPaneNode => ({ type: 'pane', id: `${row.id}-missing`, activeTabId: null, tabs: [] });
        const left = children[0] ? buildNode(children[0]) : fallbackPane();
        const right = children[1] ? buildNode(children[1]) : fallbackPane();
        const split: ISplitNode = {
          type: 'split',
          orientation: row.splitAxis ?? 'horizontal',
          ratio: row.ratio ?? 50,
          children: [left, right],
        };
        return split;
      };

      const root = buildNode(rootPane);
      const layout: ILayoutData = {
        root,
        activePaneId: workspace.activePaneId,
        updatedAt: nowIso(),
      };
      return layout;
    },

    listMutationEvents(): IMutationEventRow[] {
      return db.prepare(`
        select id, entity_type as entityType, entity_id as entityId, event_type as eventType
        from mutation_events
        order by created_at asc, id asc
      `).all() as IMutationEventRow[];
    },

    listWorkspaces(): IRuntimeWorkspace[] {
      return db.prepare(`
        select id, name, default_cwd as defaultCwd, active, group_id as groupId, order_index as orderIndex, created_at as createdAt, updated_at as updatedAt
        from workspaces
        order by order_index asc, created_at asc, id asc
      `).all() as IRuntimeWorkspace[];
    },
  };
};
