import type { ISessionHistoryEntry } from '@/types/session-history';
import type { ITabStatusEntry } from '@/types/status';

export interface IStatusJsonlStats {
  toolUsage: Record<string, number>;
  touchedFiles: string[];
  lastAssistantText: string | null;
  lastUserText: string | null;
  firstUserTs: number | null;
  lastAssistantTs: number | null;
  turnDurationMs: number | null;
}

interface IBuildStatusSessionHistoryEntryInput {
  id: string;
  tabId: string;
  entry: Pick<ITabStatusEntry, 'workspaceId' | 'agentSessionId' | 'lastUserMessage'>;
  workspaceName: string;
  workspaceDir: string | null;
  stats: IStatusJsonlStats | null;
  prevBusySince: number | null | undefined;
  cancelled: boolean;
  now: number;
}

export const buildStatusSessionHistoryEntry = ({
  id,
  tabId,
  entry,
  workspaceName,
  workspaceDir,
  stats,
  prevBusySince,
  cancelled,
  now,
}: IBuildStatusSessionHistoryEntryInput): ISessionHistoryEntry => {
  const startedAt = stats?.firstUserTs ?? prevBusySince ?? now;
  const completedAt = cancelled ? now : (stats?.lastAssistantTs ?? now);
  const duration = cancelled
    ? completedAt - startedAt
    : (stats?.turnDurationMs ?? (completedAt - startedAt));

  return {
    id,
    workspaceId: entry.workspaceId,
    workspaceName,
    workspaceDir,
    tabId,
    agentSessionId: entry.agentSessionId ?? null,
    prompt: stats?.lastUserText ?? entry.lastUserMessage ?? null,
    result: stats?.lastAssistantText ?? null,
    startedAt,
    completedAt,
    duration,
    dismissedAt: completedAt,
    toolUsage: stats?.toolUsage ?? {},
    touchedFiles: stats?.touchedFiles ?? [],
    ...(cancelled ? { cancelled: true } : {}),
  };
};
