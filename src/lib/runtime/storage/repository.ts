import type {
  IRuntimeCreateWorkspaceResult,
  IRuntimeDeleteWorkspaceStorageResult,
  IRuntimePendingTerminalTab,
  IRuntimeTerminalTab,
  IRuntimeWorkspace,
  IRuntimeWorkspaceTerminalSession,
  TRuntimeLayout,
} from '@/lib/runtime/contracts';
import { createRuntimeId } from '@/lib/runtime/session-name';
import type { TRuntimeDatabase } from '@/lib/runtime/storage/schema';
import type { IPaneNode, ITab } from '@/types/terminal';

export interface ICreateWorkspaceInput {
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
  cwd: string | null;
  panelType: string;
  lifecycleState: string;
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
      insert into workspaces (id, name, default_cwd, active, order_index, created_at, updated_at)
      values (?, ?, ?, 1, 0, ?, ?)
    `).run(workspaceId, input.name, input.defaultCwd, ts, ts);

    db.prepare(`
      insert into panes (id, workspace_id, node_kind, position, created_at, updated_at)
      values (?, ?, 'pane', 0, ?, ?)
    `).run(rootPaneId, workspaceId, ts, ts);

    recordEvent('workspace', workspaceId, 'workspace.created', input);
    return { id: workspaceId, rootPaneId };
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
        and lifecycle_state in ('pending_terminal', 'ready')
      order by created_at asc, order_index asc, id asc
    `).all(input.workspaceId) as IRuntimeWorkspaceTerminalSession[];
    const result = db.prepare(`delete from workspaces where id = ?`).run(input.workspaceId);
    if (result.changes === 0) return { deleted: false, sessions: [] };
    recordEvent('workspace', input.workspaceId, 'workspace.deleted', input);
    return { deleted: true, sessions };
  });

  return {
    createWorkspace: createWorkspaceTx,
    createPendingTerminalTab: createPendingTerminalTabTx,
    finalizeTerminalTab: finalizeTerminalTabTx,
    failPendingTerminalTab: failPendingTerminalTabTx,
    failReadyTerminalTab: failReadyTerminalTabTx,
    deleteWorkspace: deleteWorkspaceTx,

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
        select id, session_name as sessionName, name, order_index as "order", cwd, panel_type as panelType, lifecycle_state as lifecycleState
        from tabs
        where panel_type = 'terminal' and lifecycle_state = 'ready'
        order by created_at asc, order_index asc, id asc
      `).all() as ITabRow[];
      return rows.map((row) => ({
        id: row.id,
        sessionName: row.sessionName,
        name: row.name,
        order: row.order,
        ...(row.cwd ? { cwd: row.cwd } : {}),
        panelType: 'terminal',
        lifecycleState: 'ready',
      }));
    },

    getReadyTerminalTabBySession(sessionName: string): IRuntimeTerminalTab | null {
      const row = db.prepare(`
        select id, session_name as sessionName, name, order_index as "order", cwd, panel_type as panelType, lifecycle_state as lifecycleState
        from tabs
        where session_name = ? and panel_type = 'terminal' and lifecycle_state = 'ready'
      `).get(sessionName) as ITabRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        sessionName: row.sessionName,
        name: row.name,
        order: row.order,
        ...(row.cwd ? { cwd: row.cwd } : {}),
        panelType: 'terminal',
        lifecycleState: 'ready',
      };
    },

    getWorkspaceLayout(workspaceId: string): TRuntimeLayout {
      const pane = db.prepare(`
        select id, active_tab_id as activeTabId
        from panes
        where workspace_id = ? and parent_id is null
      `).get(workspaceId) as { id: string; activeTabId: string | null } | undefined;
      if (!pane) return null;
      const tabs = db.prepare(`
        select id, session_name as sessionName, name, order_index as "order", cwd, panel_type as panelType
        from tabs
        where pane_id = ? and lifecycle_state = 'ready'
        order by order_index asc, created_at asc, id asc
      `).all(pane.id) as Array<{
        id: string;
        sessionName: string;
        name: string;
        order: number;
        cwd: string | null;
        panelType: ITab['panelType'];
      }>;
      const root: IPaneNode = {
        type: 'pane',
        id: pane.id,
        activeTabId: pane.activeTabId,
        tabs: tabs.map((tab) => ({
          id: tab.id,
          sessionName: tab.sessionName,
          name: tab.name,
          order: tab.order,
          ...(tab.cwd ? { cwd: tab.cwd } : {}),
          ...(tab.panelType ? { panelType: tab.panelType } : {}),
        })),
      };
      return { root, activePaneId: pane.id, updatedAt: nowIso() };
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
