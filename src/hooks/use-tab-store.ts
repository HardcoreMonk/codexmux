import { create } from 'zustand';
import type { TCliState, TClaudeStatus } from '@/types/timeline';
import type { TTabDisplayStatus } from '@/types/status';

export type TSessionView =
  | 'loading'
  | 'restarting'
  | 'not-installed'
  | 'timeline'
  | 'inactive';

export interface ITabState {
  terminalConnected: boolean;
  claudeStatus: TClaudeStatus;
  claudeStatusCheckedAt: number;
  cliState: TCliState;
  isTimelineLoading: boolean;
  isRestarting: boolean;
  isResuming: boolean;
  workspaceId: string;
}

const DEFAULT_TAB_STATE: ITabState = {
  terminalConnected: false,
  claudeStatus: 'unknown',
  claudeStatusCheckedAt: 0,
  cliState: 'inactive',
  isTimelineLoading: true,
  isRestarting: false,
  isResuming: false,
  workspaceId: '',
};

interface ITabStore {
  tabs: Record<string, ITabState>;
  tabOrders: Record<string, string[]>;
  statusWsConnected: boolean;

  initTab: (tabId: string, initial?: Partial<ITabState>) => void;
  removeTab: (tabId: string) => void;

  setTerminalConnected: (tabId: string, connected: boolean) => void;
  setClaudeStatus: (tabId: string, status: TClaudeStatus, checkedAt: number) => void;
  setCliState: (tabId: string, state: TCliState) => void;
  setTimelineLoading: (tabId: string, loading: boolean) => void;
  setRestarting: (tabId: string, restarting: boolean) => void;
  dismissTab: (tabId: string) => void;
  setResuming: (tabId: string, resuming: boolean) => void;
  setWorkspaceId: (tabId: string, workspaceId: string) => void;
  setTabOrder: (workspaceId: string, tabIds: string[]) => void;
  setStatusWsConnected: (connected: boolean) => void;
  syncAllFromServer: (serverTabs: Record<string, { cliState: TCliState; workspaceId: string }>) => void;
  updateFromServer: (tabId: string, update: { cliState: TCliState | null; workspaceId: string }) => void;
}

const updateTab = (
  tabs: Record<string, ITabState>,
  tabId: string,
  patch: Partial<ITabState>,
): Record<string, ITabState> => {
  const prev = tabs[tabId];
  if (!prev) return tabs;
  return { ...tabs, [tabId]: { ...prev, ...patch } };
};

const useTabStore = create<ITabStore>((set) => ({
  tabs: {},
  tabOrders: {},
  statusWsConnected: false,

  initTab: (tabId, initial) =>
    set((state) => ({
      tabs: {
        ...state.tabs,
        [tabId]: { ...DEFAULT_TAB_STATE, ...state.tabs[tabId], ...initial },
      },
    })),

  removeTab: (tabId) =>
    set((state) => {
      const { [tabId]: _removed, ...rest } = state.tabs;  
      return { tabs: rest };
    }),

  setTerminalConnected: (tabId, connected) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.terminalConnected === connected) return state;
      return { tabs: updateTab(state.tabs, tabId, { terminalConnected: connected }) };
    }),

  setClaudeStatus: (tabId, status, checkedAt) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.claudeStatusCheckedAt > checkedAt) return state;
      if (prev.claudeStatus === status) return state;
      const patch: Partial<ITabState> = { claudeStatus: status, claudeStatusCheckedAt: checkedAt };
      if (prev.claudeStatus === 'running' && status !== 'running' && prev.isResuming) {
        patch.isResuming = false;
      }
      return { tabs: updateTab(state.tabs, tabId, patch) };
    }),

  // 로컬 경로 (onSync에서 호출): busy→idle 시 needs-attention 승격, needs-attention/needs-input 보호
  setCliState: (tabId, cliState) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.cliState === cliState) return state;
      if (prev.cliState === 'needs-attention' && cliState === 'idle') return state;
      if (prev.cliState === 'needs-input') return state;
      const effective = (prev.cliState === 'busy' && cliState === 'idle') ? 'needs-attention' as const : cliState;
      return { tabs: updateTab(state.tabs, tabId, { cliState: effective }) };
    }),

  setTimelineLoading: (tabId, loading) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.isTimelineLoading === loading) return state;
      return { tabs: updateTab(state.tabs, tabId, { isTimelineLoading: loading }) };
    }),

  setRestarting: (tabId, restarting) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.isRestarting === restarting) return state;
      return { tabs: updateTab(state.tabs, tabId, { isRestarting: restarting }) };
    }),

  dismissTab: (tabId) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.cliState !== 'needs-attention') return state;
      return { tabs: updateTab(state.tabs, tabId, { cliState: 'idle' }) };
    }),

  setResuming: (tabId, resuming) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.isResuming === resuming) return state;
      return { tabs: updateTab(state.tabs, tabId, { isResuming: resuming }) };
    }),

  setWorkspaceId: (tabId, workspaceId) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.workspaceId === workspaceId) return state;
      return { tabs: updateTab(state.tabs, tabId, { workspaceId }) };
    }),

  setTabOrder: (workspaceId, tabIds) =>
    set((state) => {
      const prev = state.tabOrders[workspaceId];
      if (prev && prev.length === tabIds.length && prev.every((id, i) => id === tabIds[i])) return state;
      return { tabOrders: { ...state.tabOrders, [workspaceId]: tabIds } };
    }),

  setStatusWsConnected: (connected) => set({ statusWsConnected: connected }),

  // 서버 경로: 서버가 authority, 직접 patch (promotion/guard 없음)
  syncAllFromServer: (serverTabs) =>
    set((state) => {
      const next = { ...state.tabs };
      for (const [tabId, entry] of Object.entries(serverTabs)) {
        const existing = next[tabId];
        if (existing) {
          next[tabId] = { ...existing, cliState: entry.cliState, workspaceId: entry.workspaceId };
        } else {
          next[tabId] = { ...DEFAULT_TAB_STATE, cliState: entry.cliState, workspaceId: entry.workspaceId };
        }
      }
      return { tabs: next };
    }),

  updateFromServer: (tabId, update) =>
    set((state) => {
      if (update.cliState === null) {
        const { [tabId]: _removed, ...rest } = state.tabs;  
        return { tabs: rest };
      }
      const existing = state.tabs[tabId];
      if (existing) {
        return { tabs: updateTab(state.tabs, tabId, { cliState: update.cliState, workspaceId: update.workspaceId }) };
      }
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...DEFAULT_TAB_STATE, cliState: update.cliState, workspaceId: update.workspaceId },
        },
      };
    }),
}));

// --- helpers ---

export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'needs-attention';

// --- 파생 selectors ---

export const selectSessionView = (tabs: Record<string, ITabState>, tabId: string): TSessionView => {
  const tab = tabs[tabId];
  if (!tab) return 'inactive';

  if (tab.isRestarting) return 'restarting';
  if (tab.claudeStatus === 'not-installed') return 'not-installed';

  if (tab.claudeStatus === 'running') {
    return tab.isTimelineLoading ? 'loading' : 'timeline';
  }

  if (tab.isResuming || tab.isTimelineLoading) return 'loading';

  return 'inactive';
};

export const selectTabDisplayStatus = (tabs: Record<string, ITabState>, tabId: string): TTabDisplayStatus => {
  const tab = tabs[tabId];
  if (!tab || tab.cliState === 'inactive') return 'idle';
  if (tab.cliState === 'busy') return 'busy';
  if (tab.cliState === 'needs-attention') return 'needs-attention';
  if (tab.cliState === 'needs-input') return 'needs-input';
  return 'idle';
};

export const selectWorkspaceStatus = (
  tabs: Record<string, ITabState>,
  wsId: string,
): { busyCount: number; attentionCount: number } => {
  let busyCount = 0;
  let attentionCount = 0;
  for (const entry of Object.values(tabs)) {
    if (entry.workspaceId !== wsId) continue;
    if (entry.cliState === 'busy') busyCount++;
    else if (entry.cliState === 'needs-attention') attentionCount++;
  }
  return { busyCount, attentionCount };
};

export const selectGlobalStatus = (
  tabs: Record<string, ITabState>,
): { busyCount: number; attentionCount: number } => {
  let busyCount = 0;
  let attentionCount = 0;
  for (const entry of Object.values(tabs)) {
    if (entry.cliState === 'busy') busyCount++;
    else if (entry.cliState === 'needs-attention') attentionCount++;
  }
  return { busyCount, attentionCount };
};

export default useTabStore;
