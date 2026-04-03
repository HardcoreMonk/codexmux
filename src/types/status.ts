import type { TCliState } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

export type TTerminalStatus = 'idle' | 'running' | 'server';

export interface ITabStatusEntry {
  cliState: TCliState;
  workspaceId: string;
  tabName: string;
  currentProcess?: string;
  tmuxSession: string;
  panelType?: TPanelType;
  terminalStatus?: TTerminalStatus;
  listeningPorts?: number[];
}

export type TTabDisplayStatus = 'busy' | 'ready-for-review' | 'needs-input' | 'idle';

export type IClientTabStatusEntry = Omit<ITabStatusEntry, 'tmuxSession'>;

export interface IStatusSyncMessage {
  type: 'status:sync';
  tabs: Record<string, IClientTabStatusEntry>;
}

export interface IStatusUpdateMessage {
  type: 'status:update';
  tabId: string;
  cliState: TCliState | null;
  workspaceId: string;
  tabName: string;
  currentProcess?: string;
  panelType?: TPanelType;
  terminalStatus?: TTerminalStatus;
  listeningPorts?: number[];
}

export type TStatusServerMessage = IStatusSyncMessage | IStatusUpdateMessage;

export interface IStatusTabDismissedMessage {
  type: 'status:tab-dismissed';
  tabId: string;
}

export type TStatusClientMessage = IStatusTabDismissedMessage;
