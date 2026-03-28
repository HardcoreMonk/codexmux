import type { TCliState } from '@/types/timeline';

export interface ITabStatusEntry {
  cliState: TCliState;
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
  workspaceId: string;
  tabName: string;
}

export type TStatusServerMessage = IStatusSyncMessage | IStatusUpdateMessage;

export interface IStatusTabDismissedMessage {
  type: 'status:tab-dismissed';
  tabId: string;
}

export type TStatusClientMessage = IStatusTabDismissedMessage;
