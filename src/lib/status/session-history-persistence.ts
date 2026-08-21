import type { ISessionHistoryEntry } from '@/types/session-history';

interface IUpdateSessionHistoryDismissedAtInput {
  tabId: string;
  dismissedAt: number;
}

interface ICreateStatusSessionHistoryPersistenceDependencies {
  shouldUseRuntimeDefault: () => boolean;
  addRuntime: (entry: ISessionHistoryEntry) => Promise<void>;
  updateRuntimeDismissedAt: (input: IUpdateSessionHistoryDismissedAtInput) => Promise<{ entry: ISessionHistoryEntry | null }>;
  addLegacy: (entry: ISessionHistoryEntry) => Promise<void>;
  updateLegacyDismissedAt: (tabId: string, dismissedAt: number) => Promise<ISessionHistoryEntry | null>;
  recordCounter?: (name: string, delta?: number) => void;
  warn?: (message: string) => void;
}

export const createStatusSessionHistoryPersistence = ({
  shouldUseRuntimeDefault,
  addRuntime,
  updateRuntimeDismissedAt,
  addLegacy,
  updateLegacyDismissedAt,
  recordCounter,
  warn,
}: ICreateStatusSessionHistoryPersistenceDependencies) => ({
  async add(entry: ISessionHistoryEntry): Promise<void> {
    if (shouldUseRuntimeDefault()) {
      try {
        await addRuntime(entry);
        recordCounter?.('runtime_v2.status_session_history.add');
        return;
      } catch (err) {
        recordCounter?.('runtime_v2.status_session_history.add_fallback');
        warn?.(`runtime v2 session history add failed, falling back: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    await addLegacy(entry);
  },

  async updateDismissedAt(input: IUpdateSessionHistoryDismissedAtInput): Promise<ISessionHistoryEntry | null> {
    if (shouldUseRuntimeDefault()) {
      try {
        const result = await updateRuntimeDismissedAt(input);
        recordCounter?.('runtime_v2.status_session_history.dismiss_update');
        return result.entry;
      } catch (err) {
        recordCounter?.('runtime_v2.status_session_history.dismiss_update_fallback');
        warn?.(`runtime v2 session history dismiss update failed, falling back: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return updateLegacyDismissedAt(input.tabId, input.dismissedAt);
  },
});
