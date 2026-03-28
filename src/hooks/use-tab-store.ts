import { create } from 'zustand';
import { resolveDismissed } from '@/lib/resolve-dismissed';
import type { TCliState, TSessionStatus, TTimelineConnectionStatus } from '@/types/timeline';
import type { TTabDisplayStatus } from '@/types/status';

export type TSessionView =
  | 'loading'
  | 'restarting'
  | 'not-installed'
  | 'timeline'
  | 'list'
  | 'empty';

export type TClaudeProcess = 'unknown' | 'running' | 'not-running';

export interface ITabState {
  // 터미널 WS
  terminalConnected: boolean;
  claudeProcess: TClaudeProcess;

  // 타임라인 WS
  sessionStatus: TSessionStatus;
  cliState: TCliState;
  isTimelineLoading: boolean;
  timelineWsStatus: TTimelineConnectionStatus;

  // 세션 목록
  hasSessions: boolean;

  // 사용자 액션 / 네비게이션
  isRestarting: boolean;
  dismissed: boolean;
  manualView: 'list' | 'timeline' | null;

  // 메타
  workspaceId: string;
  tabName: string;
}

const DEFAULT_TAB_STATE: ITabState = {
  terminalConnected: false,
  claudeProcess: 'unknown',
  sessionStatus: 'none',
  cliState: 'inactive',
  isTimelineLoading: true,
  timelineWsStatus: 'disconnected',
  hasSessions: false,
  isRestarting: false,
  dismissed: true,
  manualView: null,
  workspaceId: '',
  tabName: '',
};

interface ITabStore {
  tabs: Record<string, ITabState>;
  tabOrders: Record<string, string[]>;
  statusWsConnected: boolean;

  // 탭 생명주기
  initTab: (tabId: string, initial?: Partial<ITabState>) => void;
  removeTab: (tabId: string) => void;

  // 터미널 WS
  setTerminalConnected: (tabId: string, connected: boolean) => void;
  setClaudeProcess: (tabId: string, status: TClaudeProcess) => void;

  // 타임라인 WS
  setSessionStatus: (tabId: string, status: TSessionStatus) => void;
  setCliState: (tabId: string, state: TCliState) => void;
  setTimelineLoading: (tabId: string, loading: boolean) => void;
  setTimelineWsStatus: (tabId: string, status: TTimelineConnectionStatus) => void;

  // 세션 목록
  setHasSessions: (tabId: string, has: boolean) => void;

  // 사용자 액션
  setRestarting: (tabId: string, restarting: boolean) => void;
  setDismissed: (tabId: string, dismissed: boolean) => void;
  navigateToList: (tabId: string) => void;
  navigateToTimeline: (tabId: string) => void;

  // 메타
  setTabMeta: (tabId: string, workspaceId: string, tabName: string) => void;
  setTabOrder: (workspaceId: string, tabIds: string[]) => void;

  // status WS 연결
  setStatusWsConnected: (connected: boolean) => void;

  // 서버 status 동기화 (기존 useClaudeStatusStore 대체)
  syncAllFromServer: (serverTabs: Record<string, { cliState: TCliState; dismissed: boolean; workspaceId: string; tabName: string }>) => void;
  updateFromServer: (tabId: string, update: { cliState: TCliState | null; dismissed: boolean; workspaceId: string; tabName: string }) => void;
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
      const { [tabId]: _removed, ...rest } = state.tabs; // eslint-disable-line @typescript-eslint/no-unused-vars
      return { tabs: rest };
    }),

  setTerminalConnected: (tabId, connected) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.terminalConnected === connected) return state;
      return { tabs: updateTab(state.tabs, tabId, { terminalConnected: connected }) };
    }),

  setClaudeProcess: (tabId, status) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.claudeProcess === status) return state;
      return { tabs: updateTab(state.tabs, tabId, { claudeProcess: status }) };
    }),

  setSessionStatus: (tabId, status) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.sessionStatus === status) return state;
      const patch: Partial<ITabState> = { sessionStatus: status };
      // active→none 전환 시 manualView === 'timeline'이면 리셋
      if (prev.sessionStatus === 'active' && status !== 'active' && prev.manualView === 'timeline') {
        patch.manualView = null;
      }
      return { tabs: updateTab(state.tabs, tabId, patch) };
    }),

  setCliState: (tabId, cliState) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.cliState === cliState) return state;
      const dismissed = resolveDismissed(prev.cliState, cliState, prev.dismissed);
      return { tabs: updateTab(state.tabs, tabId, { cliState, dismissed }) };
    }),

  setTimelineLoading: (tabId, loading) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.isTimelineLoading === loading) return state;
      return { tabs: updateTab(state.tabs, tabId, { isTimelineLoading: loading }) };
    }),

  setTimelineWsStatus: (tabId, status) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.timelineWsStatus === status) return state;
      return { tabs: updateTab(state.tabs, tabId, { timelineWsStatus: status }) };
    }),

  setHasSessions: (tabId, has) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.hasSessions === has) return state;
      return { tabs: updateTab(state.tabs, tabId, { hasSessions: has }) };
    }),

  setRestarting: (tabId, restarting) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.isRestarting === restarting) return state;
      return { tabs: updateTab(state.tabs, tabId, { isRestarting: restarting }) };
    }),

  setDismissed: (tabId, dismissed) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.dismissed === dismissed) return state;
      return { tabs: updateTab(state.tabs, tabId, { dismissed }) };
    }),

  navigateToList: (tabId) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.manualView === 'list') return state;
      return { tabs: updateTab(state.tabs, tabId, { manualView: 'list' }) };
    }),

  navigateToTimeline: (tabId) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.manualView === 'timeline') return state;
      return { tabs: updateTab(state.tabs, tabId, { manualView: 'timeline' }) };
    }),

  setTabMeta: (tabId, workspaceId, tabName) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || (prev.workspaceId === workspaceId && prev.tabName === tabName)) return state;
      return { tabs: updateTab(state.tabs, tabId, { workspaceId, tabName }) };
    }),

  setTabOrder: (workspaceId, tabIds) =>
    set((state) => {
      const prev = state.tabOrders[workspaceId];
      if (prev && prev.length === tabIds.length && prev.every((id, i) => id === tabIds[i])) return state;
      return { tabOrders: { ...state.tabOrders, [workspaceId]: tabIds } };
    }),

  setStatusWsConnected: (connected) => set({ statusWsConnected: connected }),

  syncAllFromServer: (serverTabs) =>
    set((state) => {
      const next = { ...state.tabs };
      for (const [tabId, entry] of Object.entries(serverTabs)) {
        const existing = next[tabId];
        if (existing) {
          next[tabId] = { ...existing, cliState: entry.cliState, dismissed: entry.dismissed, workspaceId: entry.workspaceId, tabName: entry.tabName };
        } else {
          next[tabId] = { ...DEFAULT_TAB_STATE, cliState: entry.cliState, dismissed: entry.dismissed, workspaceId: entry.workspaceId, tabName: entry.tabName };
        }
      }
      return { tabs: next };
    }),

  updateFromServer: (tabId, update) =>
    set((state) => {
      if (update.cliState === null) {
        const { [tabId]: _removed, ...rest } = state.tabs; // eslint-disable-line @typescript-eslint/no-unused-vars
        return { tabs: rest };
      }
      const existing = state.tabs[tabId];
      if (existing) {
        return { tabs: updateTab(state.tabs, tabId, { cliState: update.cliState, dismissed: update.dismissed, workspaceId: update.workspaceId, tabName: update.tabName }) };
      }
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...DEFAULT_TAB_STATE, cliState: update.cliState, dismissed: update.dismissed, workspaceId: update.workspaceId, tabName: update.tabName },
        },
      };
    }),
}));

// --- 파생 selectors ---

const isEffectivelyActive = (tab: ITabState): boolean =>
  tab.sessionStatus === 'active'
  && tab.claudeProcess !== 'not-running';

export const selectEffectiveSessionStatus = (tabs: Record<string, ITabState>, tabId: string): 'active' | 'none' | 'not-installed' => {
  const tab = tabs[tabId];
  if (!tab) return 'none';
  return isEffectivelyActive(tab) ? tab.sessionStatus : (tab.sessionStatus === 'active' ? 'none' : tab.sessionStatus);
};

export const selectSessionView = (tabs: Record<string, ITabState>, tabId: string): TSessionView => {
  const tab = tabs[tabId];
  if (!tab) return 'empty';

  if (tab.isRestarting) return 'restarting';
  if (tab.sessionStatus === 'not-installed') return 'not-installed';

  if (isEffectivelyActive(tab)) {
    return tab.isTimelineLoading ? 'loading' : 'timeline';
  }

  if (tab.manualView === 'list') return 'list';
  if (tab.manualView === 'timeline' || tab.isTimelineLoading) return 'loading';

  return tab.hasSessions ? 'list' : 'empty';
};

export const selectTabDisplayStatus = (tabs: Record<string, ITabState>, tabId: string): TTabDisplayStatus => {
  const tab = tabs[tabId];
  if (!tab || tab.cliState === 'inactive') return 'idle';
  if (tab.cliState === 'busy') return 'busy';
  if (tab.cliState === 'idle' && !tab.dismissed) return 'needs-attention';
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
    else if (entry.cliState === 'idle' && !entry.dismissed) attentionCount++;
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
    else if (entry.cliState === 'idle' && !entry.dismissed) attentionCount++;
  }
  return { busyCount, attentionCount };
};

export default useTabStore;
