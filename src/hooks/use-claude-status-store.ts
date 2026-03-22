import { create } from 'zustand';
import type { TCliState } from '@/types/timeline';
import type { TTabDisplayStatus } from '@/types/status';

interface ITabStatusEntry {
  cliState: TCliState;
  dismissed: boolean;
  workspaceId: string;
  tabName: string;
}

interface IClaudeStatusState {
  tabs: Record<string, ITabStatusEntry>;
  wsConnected: boolean;

  setConnected: (connected: boolean) => void;
  syncAll: (tabs: Record<string, ITabStatusEntry>) => void;
  updateTab: (tabId: string, update: ITabStatusEntry | null) => void;
  dismissTabLocal: (tabId: string) => void;
}

const useClaudeStatusStore = create<IClaudeStatusState>((set) => ({
  tabs: {},
  wsConnected: false,

  setConnected: (connected) => set({ wsConnected: connected }),

  syncAll: (tabs) => set({ tabs }),

  updateTab: (tabId, update) =>
    set((state) => {
      if (!update || update.cliState === null) {
        const next = { ...state.tabs };
        delete next[tabId];
        return { tabs: next };
      }
      return {
        tabs: { ...state.tabs, [tabId]: update },
      };
    }),

  dismissTabLocal: (tabId) =>
    set((state) => {
      const entry = state.tabs[tabId];
      if (!entry || entry.dismissed) return state;
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...entry, dismissed: true },
        },
      };
    }),
}));

export const getTabStatus = (tabs: Record<string, ITabStatusEntry>, tabId: string): TTabDisplayStatus => {
  const entry = tabs[tabId];
  if (!entry || entry.cliState === 'inactive') return 'idle';
  if (entry.cliState === 'busy') return 'busy';
  if (entry.cliState === 'idle' && !entry.dismissed) return 'needs-attention';
  return 'idle';
};

export const getWorkspaceStatus = (
  tabs: Record<string, ITabStatusEntry>,
  wsId: string,
): { busyCount: number; attentionCount: number } => {
  let busyCount = 0;
  let attentionCount = 0;
  for (const [, entry] of Object.entries(tabs)) {
    if (entry.workspaceId !== wsId) continue;
    if (entry.cliState === 'busy') busyCount++;
    else if (entry.cliState === 'idle' && !entry.dismissed) attentionCount++;
  }
  return { busyCount, attentionCount };
};

export const getGlobalStatus = (
  tabs: Record<string, ITabStatusEntry>,
): { busyCount: number; attentionCount: number } => {
  let busyCount = 0;
  let attentionCount = 0;
  for (const [, entry] of Object.entries(tabs)) {
    if (entry.cliState === 'busy') busyCount++;
    else if (entry.cliState === 'idle' && !entry.dismissed) attentionCount++;
  }
  return { busyCount, attentionCount };
};

export default useClaudeStatusStore;
