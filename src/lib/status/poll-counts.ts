import type { IStatusPollCounts } from '@/lib/status/poll-service';

export const createStatusPollCounts = (): IStatusPollCounts => ({
  workspaceCount: 0,
  paneCount: 0,
  scannedTabCount: 0,
  providerTabCount: 0,
  terminalTabCount: 0,
  broadcastUpdateCount: 0,
  broadcastRemoveCount: 0,
});

export const applyStatusPollTraversalCounts = (
  counts: IStatusPollCounts,
  next: Pick<IStatusPollCounts, 'workspaceCount' | 'paneCount' | 'scannedTabCount'>,
): void => {
  counts.workspaceCount = next.workspaceCount;
  counts.paneCount = next.paneCount;
  counts.scannedTabCount = next.scannedTabCount;
};

export const recordStatusPollTabKind = (
  counts: IStatusPollCounts,
  hasProvider: boolean,
): void => {
  if (hasProvider) counts.providerTabCount++;
  else counts.terminalTabCount++;
};

export const recordStatusPollBroadcastUpdate = (counts: IStatusPollCounts): void => {
  counts.broadcastUpdateCount++;
};

export const recordStatusPollBroadcastRemove = (counts: IStatusPollCounts): void => {
  counts.broadcastRemoveCount++;
};
