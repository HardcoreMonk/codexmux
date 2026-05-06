import { formatTabTitle } from '@/lib/tab-title';
import type { IPaneInfo } from '@/lib/tmux';
import type { TCliState } from '@/types/timeline';
import type { ITab } from '@/types/terminal';
import type {
  ICurrentAction,
  ILastEvent,
  ITabStatusEntry,
  TTerminalStatus,
} from '@/types/status';

interface IBuildStatusTabEntryInput {
  workspaceId: string;
  tab: Pick<ITab, 'sessionName' | 'name' | 'panelType' | 'lastUserMessage' | 'dismissedAt'>;
  paneInfo?: Pick<IPaneInfo, 'command' | 'path'>;
  cliState: TCliState;
  terminalStatus: TTerminalStatus;
  listeningPorts: number[];
  agentSummary?: string | null;
  agentSessionId?: string | null;
  jsonlPath?: string | null;
  lastAssistantSnippet?: string | null;
  currentAction?: ICurrentAction | null;
  lastEvent?: ILastEvent | null;
  now: number;
  restoreLifecycleFields: boolean;
}

export const buildStatusTabEntry = ({
  workspaceId,
  tab,
  paneInfo,
  cliState,
  terminalStatus,
  listeningPorts,
  agentSummary,
  agentSessionId,
  jsonlPath,
  lastAssistantSnippet,
  currentAction,
  lastEvent,
  now,
  restoreLifecycleFields,
}: IBuildStatusTabEntryInput): ITabStatusEntry => {
  const paneTitle = paneInfo ? `${paneInfo.command}|${paneInfo.path}` : undefined;
  return {
    cliState,
    workspaceId,
    tabName: tab.name || (paneTitle ? formatTabTitle(paneTitle) : ''),
    currentProcess: paneInfo?.command,
    paneTitle,
    tmuxSession: tab.sessionName,
    panelType: tab.panelType,
    terminalStatus,
    listeningPorts,
    agentSummary,
    lastUserMessage: tab.lastUserMessage,
    lastAssistantMessage: lastAssistantSnippet,
    currentAction,
    ...(restoreLifecycleFields
      ? {
        readyForReviewAt: cliState === 'ready-for-review' ? now : null,
        busySince: null,
        dismissedAt: tab.dismissedAt ?? null,
      }
      : {}),
    agentSessionId,
    jsonlPath,
    lastEvent,
    eventSeq: 0,
  };
};
