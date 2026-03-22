import type { TCliState } from '@/types/timeline';

export interface ITabStatusEntry {
  cliState: TCliState;
  dismissed: boolean;
  workspaceId: string;
  tabName: string;
  tmuxSession: string;
}

export type TTabDisplayStatus = 'busy' | 'needs-attention' | 'idle';

export type IClientTabStatusEntry = Omit<ITabStatusEntry, 'tmuxSession'>;

export interface IStatusSyncMessage {
  type: 'status:sync';
  tabs: Record<string, IClientTabStatusEntry>;
}

export interface IStatusUpdateMessage {
  type: 'status:update';
  tabId: string;
  cliState: TCliState | null;
  dismissed: boolean;
  workspaceId: string;
  tabName: string;
}

export type TStatusServerMessage = IStatusSyncMessage | IStatusUpdateMessage;

export interface IStatusTabDismissedMessage {
  type: 'status:tab-dismissed';
  tabId: string;
}

export interface IStatusTabActiveReportMessage {
  type: 'status:tab-active-report';
  tabId: string;
  cliState: TCliState;
}

export type TStatusClientMessage =
  | IStatusTabDismissedMessage
  | IStatusTabActiveReportMessage;
