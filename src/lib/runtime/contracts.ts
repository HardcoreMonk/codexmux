import type { ILayoutData } from '@/types/terminal';

export interface IRuntimeHealth {
  ok: boolean;
  storage: unknown;
  terminal: unknown;
}

export interface IRuntimeWorkspace {
  id: string;
  name: string;
  defaultCwd: string;
  active: boolean | number;
  groupId?: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface IRuntimeCreateWorkspaceResult {
  id: string;
  rootPaneId: string;
}

export interface IRuntimeWorkspaceList {
  workspaces: IRuntimeWorkspace[];
}

export interface IRuntimeWorkspaceTerminalSession {
  sessionName: string;
}

export interface IRuntimeTerminalSessionPresence {
  sessionName: string;
  exists: boolean;
}

export interface IRuntimeDeleteWorkspaceStorageResult {
  deleted: boolean;
  sessions: IRuntimeWorkspaceTerminalSession[];
}

export interface IRuntimeDeleteWorkspaceResult {
  deleted: boolean;
  killedSessions: string[];
  failedKills: Array<{ sessionName: string; error: string }>;
}

export interface IRuntimeDeleteTerminalTabStorageResult {
  deleted: boolean;
  session: IRuntimeWorkspaceTerminalSession | null;
}

export interface IRuntimeDeleteTerminalTabResult {
  deleted: boolean;
  killedSession: string | null;
  failedKill: { sessionName: string; error: string } | null;
}

export interface IRuntimeTerminalTab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  cwd?: string;
  panelType: 'terminal';
  lifecycleState: 'pending_terminal' | 'ready' | 'failed';
}

export interface IRuntimePendingTerminalTab {
  id: string;
  sessionName: string;
  workspaceId: string;
  paneId: string;
  cwd: string;
  lifecycleState: 'pending_terminal';
  createdAt: string;
}

export type TRuntimeLayout = ILayoutData | null;
