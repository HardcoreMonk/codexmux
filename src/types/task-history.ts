export interface ITaskHistoryEntry {
  id: string;
  workspaceId: string;
  workspaceName: string;
  tabId: string;
  prompt: string | null;
  result: string | null;
  startedAt: number;
  completedAt: number;
  duration: number;
  dismissedAt: number | null;
  toolUsage: Record<string, number>;
  touchedFiles: string[];
}

export interface ITaskHistoryData {
  version: 1;
  entries: ITaskHistoryEntry[];
}
