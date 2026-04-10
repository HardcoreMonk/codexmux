import type { TCliState } from '@/types/timeline';

export type TConnectionStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'session-ended';

export type TDisconnectReason = 'max-connections' | 'pty-error' | 'session-not-found' | null;

export type TPanelType = 'terminal' | 'claude-code' | 'web-browser';

export interface ITab {
  id: string;
  sessionName: string;
  name: string;
  order: number;
  title?: string;
  cwd?: string;
  panelType?: TPanelType;
  claudeSessionId?: string | null;
  claudeJsonlPath?: string | null;
  claudeSummary?: string | null;
  lastUserMessage?: string | null;
  lastCommand?: string | null;
  cliState?: TCliState;
  dismissedAt?: number | null;
  webUrl?: string | null;
}

export interface ISplitNode {
  type: 'split';
  orientation: 'horizontal' | 'vertical';
  ratio: number;
  children: [TLayoutNode, TLayoutNode];
}

export interface IPaneNode {
  type: 'pane';
  id: string;
  tabs: ITab[];
  activeTabId: string | null;
}

export type TLayoutNode = ISplitNode | IPaneNode;

export interface ILayoutData {
  root: TLayoutNode;
  activePaneId: string | null;
  updatedAt: string;
}

export interface IWorkspace {
  id: string;
  name: string;
  directories: string[];
  order: number;
}

export interface IWorkspacesData {
  workspaces: IWorkspace[];
  activeWorkspaceId?: string;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  updatedAt: string;
}
