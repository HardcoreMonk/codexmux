import { resolveAgentSessionId } from '@/lib/status-session-mapping';
import { formatTabTitle } from '@/lib/tab-title';
import type { ITabStatusEntry, TTerminalStatus } from '@/types/status';
import type { ITab } from '@/types/terminal';

interface IStatusPollRefreshedMetadata {
  sessionId?: string | null;
  jsonlPath: string | null;
}

interface IApplyStatusPollTabEntryUpdateInput {
  entry: ITabStatusEntry;
  workspaceId: string;
  tab: Pick<ITab, 'name' | 'panelType' | 'lastUserMessage'>;
  paneTitle?: string;
  currentProcess?: string;
  refreshed: IStatusPollRefreshedMetadata;
  persistedSessionId?: string | null;
  processRetries?: number;
  terminalChanged: boolean;
  terminalStatus: TTerminalStatus;
  listeningPorts: number[];
  summaryChanged: boolean;
  agentSummary?: string | null;
}

export const applyStatusPollTabEntryUpdate = ({
  entry,
  workspaceId,
  tab,
  paneTitle,
  currentProcess,
  refreshed,
  persistedSessionId,
  processRetries,
  terminalChanged,
  terminalStatus,
  listeningPorts,
  summaryChanged,
  agentSummary,
}: IApplyStatusPollTabEntryUpdateInput): void => {
  entry.tabName = tab.name || (paneTitle ? formatTabTitle(paneTitle) : '');
  entry.currentProcess = currentProcess;
  entry.paneTitle = paneTitle;
  entry.workspaceId = workspaceId;
  entry.panelType = tab.panelType;
  entry.agentSessionId = resolveAgentSessionId({
    detectedSessionId: refreshed.sessionId,
    jsonlPath: refreshed.jsonlPath,
    persistedSessionId,
    currentSessionId: entry.agentSessionId,
  });
  entry.jsonlPath = refreshed.jsonlPath ?? entry.jsonlPath;
  entry.lastUserMessage = tab.lastUserMessage;
  entry.processRetries = processRetries;

  if (terminalChanged) {
    entry.terminalStatus = terminalStatus;
    entry.listeningPorts = listeningPorts;
  }

  if (summaryChanged) {
    entry.agentSummary = agentSummary;
  }
};
