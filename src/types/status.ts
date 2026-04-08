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
  lastAssistantMessage?: string | null;
  lastAction?: string | null;
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
  lastAssistantMessage?: string | null;
  lastAction?: string | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
}

export interface IRateLimitWindow {
  used_percentage: number;
  resets_at: number;
}

export interface IRateLimitsData {
  ts: number;
  model: string;
  five_hour: IRateLimitWindow | null;
  seven_day: IRateLimitWindow | null;
  context: {
    used_pct: number;
    remaining_pct: number;
    input_tokens: number;
    output_tokens: number;
    window_size: number;
  } | null;
  cost: {
    total_cost_usd: number;
    total_duration_ms: number;
    total_duration_api_ms: number;
  } | null;
}

export interface IRateLimitsUpdateMessage {
  type: 'rate-limits:update';
  data: IRateLimitsData;
}

export type TStatusServerMessage = IStatusSyncMessage | IStatusUpdateMessage | IRateLimitsUpdateMessage;

export interface IStatusTabDismissedMessage {
  type: 'status:tab-dismissed';
  tabId: string;
}

export interface IStatusCliStateMessage {
  type: 'status:cli-state';
  tabId: string;
  cliState: TCliState;
}

export interface IStatusRequestSyncMessage {
  type: 'status:request-sync';
}

export type TStatusClientMessage = IStatusTabDismissedMessage | IStatusCliStateMessage | IStatusRequestSyncMessage;
