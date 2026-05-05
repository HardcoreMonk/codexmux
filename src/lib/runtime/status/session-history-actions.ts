import { addSessionHistoryEntry, updateSessionHistoryDismissedAt } from '@/lib/session-history';
import type { ISessionHistoryEntry } from '@/types/session-history';

export interface IStatusAddSessionHistoryResult {
  added: boolean;
  entry: ISessionHistoryEntry;
}

export interface IStatusUpdateSessionHistoryDismissedAtResult {
  updated: boolean;
  entry: ISessionHistoryEntry | null;
}

export interface IStatusSessionHistoryActions {
  addEntry: (entry: ISessionHistoryEntry) => Promise<IStatusAddSessionHistoryResult>;
  updateDismissedAt: (tabId: string, dismissedAt: number) => Promise<IStatusUpdateSessionHistoryDismissedAtResult>;
}

export const createStatusSessionHistoryActions = (): IStatusSessionHistoryActions => ({
  addEntry: async (entry) => {
    await addSessionHistoryEntry(entry);
    return { added: true, entry };
  },
  updateDismissedAt: async (tabId, dismissedAt) => {
    const entry = await updateSessionHistoryDismissedAt(tabId, dismissedAt);
    return { updated: !!entry, entry };
  },
});
