import type { TCliState } from '@/types/timeline';
import type { TPanelType } from '@/types/terminal';

export type TTerminalStatus = 'idle' | 'running' | 'server';

export interface ITabStatusEntry {
  cliState: TCliState;
  workspaceId: string;
  tabName: string;
  currentProcess?: string;
  paneTitle?: string;
  tmuxSession: string;
  panelType?: TPanelType;
  terminalStatus?: TTerminalStatus;
  listeningPorts?: number[];
  claudeSummary?: string | null;
  lastUserMessage?: string | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
  processRetries?: number;
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
  paneTitle?: string;
  panelType?: TPanelType;
  terminalStatus?: TTerminalStatus;
  listeningPorts?: number[];
  claudeSummary?: string | null;
  lastUserMessage?: string | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
}

export type TStatusServerMessage = IStatusSyncMessage | IStatusUpdateMessage;

export interface IStatusTabDismissedMessage {
  type: 'status:tab-dismissed';
  tabId: string;
}

export interface IStatusCliStateMessage {
  type: 'status:cli-state';
  tabId: string;
  cliState: TCliState;
}

export type TStatusClientMessage = IStatusTabDismissedMessage | IStatusCliStateMessage;
