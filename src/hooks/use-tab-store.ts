import { create } from 'zustand';
import type { TCliState, TClaudeStatus } from '@/types/timeline';
import type { ICurrentAction, TTabDisplayStatus, TTerminalStatus } from '@/types/status';
import type { TPanelType } from '@/types/terminal';

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
  tabName?: string;
  panelType?: TPanelType;
  terminalStatus?: TTerminalStatus;
  listeningPorts?: number[];
  currentProcess?: string;
  claudeSummary?: string | null;
  lastUserMessage?: string | null;
  lastAssistantMessage?: string | null;
  currentAction?: ICurrentAction | null;
  readyForReviewAt?: number | null;
  busySince?: number | null;
  dismissedAt?: number | null;
  claudeSessionId?: string | null;
  localUpdatedAt?: number;
}

const SYNC_GRACE_MS = 30_000;

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
  setPanelType: (tabId: string, panelType: TPanelType) => void;
  setCurrentProcess: (tabId: string, process: string | null) => void;
  setTabOrder: (workspaceId: string, tabIds: string[]) => void;
  setStatusWsConnected: (connected: boolean) => void;
  syncAllFromServer: (serverTabs: Record<string, { cliState: TCliState; workspaceId: string; tabName?: string; panelType?: TPanelType; terminalStatus?: TTerminalStatus; listeningPorts?: number[]; currentProcess?: string; claudeSummary?: string | null; lastUserMessage?: string | null; lastAssistantMessage?: string | null; currentAction?: ICurrentAction | null; readyForReviewAt?: number | null; busySince?: number | null; dismissedAt?: number | null; claudeSessionId?: string | null }>) => void;
  updateFromServer: (tabId: string, update: { cliState: TCliState | null; workspaceId: string; tabName?: string; panelType?: TPanelType; terminalStatus?: TTerminalStatus; listeningPorts?: number[]; currentProcess?: string; claudeSummary?: string | null; lastUserMessage?: string | null; lastAssistantMessage?: string | null; currentAction?: ICurrentAction | null; readyForReviewAt?: number | null; busySince?: number | null; dismissedAt?: number | null; claudeSessionId?: string | null }) => void;
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
    set((state) => {
      const existing = state.tabs[tabId];
      const merged = { ...DEFAULT_TAB_STATE, ...existing, ...initial };
      if (existing?.cliState === 'ready-for-review' && merged.cliState !== 'ready-for-review') {
        merged.cliState = 'ready-for-review';
        merged.readyForReviewAt = existing.readyForReviewAt;
      }
      return { tabs: { ...state.tabs, [tabId]: merged } };
    }),

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
      // running에서 starting 전환 차단 (running이 상위 상태)
      if (prev.claudeStatus === 'running' && status === 'starting') return state;
      const patch: Partial<ITabState> = { claudeStatus: status, claudeStatusCheckedAt: checkedAt };
      if ((prev.claudeStatus === 'running' || prev.claudeStatus === 'starting') && status !== 'running' && status !== 'starting' && prev.isResuming) {
        patch.isResuming = false;
      }
      return { tabs: updateTab(state.tabs, tabId, patch) };
    }),

  // 로컬 경로 (onSync에서 호출): busy→idle 시 ready-for-review 승격, ready-for-review/needs-input 보호
  setCliState: (tabId, cliState) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.cliState === cliState) return state;
      if (prev.cliState === 'ready-for-review' && cliState === 'idle') return state;
      if (prev.cliState === 'needs-input') return state;
      const effective = (prev.cliState === 'busy' && cliState === 'idle') ? 'ready-for-review' as const : cliState;
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
      if (!prev || prev.cliState !== 'ready-for-review') return state;
      return { tabs: updateTab(state.tabs, tabId, { cliState: 'idle', dismissedAt: Date.now() }) };
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

  setPanelType: (tabId, panelType) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev || prev.panelType === panelType) return state;
      return { tabs: updateTab(state.tabs, tabId, { panelType }) };
    }),

  setCurrentProcess: (tabId, process) =>
    set((state) => {
      const prev = state.tabs[tabId];
      if (!prev) return state;
      const value = process ?? undefined;
      if (prev.currentProcess === value) return state;
      return { tabs: updateTab(state.tabs, tabId, { currentProcess: value, localUpdatedAt: Date.now() }) };
    }),

  setTabOrder: (workspaceId, tabIds) =>
    set((state) => {
      const prev = state.tabOrders[workspaceId];
      if (prev && prev.length === tabIds.length && prev.every((id, i) => id === tabIds[i])) return state;
      return { tabOrders: { ...state.tabOrders, [workspaceId]: tabIds } };
    }),

  setStatusWsConnected: (connected) => set({ statusWsConnected: connected }),

  // 서버 경로: 초기 sync. 최근 로컬 업데이트된 탭은 통째로 보존
  syncAllFromServer: (serverTabs) =>
    set((state) => {
      const now = Date.now();
      const next: Record<string, ITabState> = {};
      for (const [tabId, entry] of Object.entries(serverTabs)) {
        const existing = state.tabs[tabId];
        if (existing?.localUpdatedAt && now - existing.localUpdatedAt < SYNC_GRACE_MS) {
          next[tabId] = existing;
        } else if (existing) {
          next[tabId] = { ...existing, cliState: entry.cliState, workspaceId: entry.workspaceId, tabName: entry.tabName, panelType: entry.panelType ?? existing.panelType, terminalStatus: entry.terminalStatus, listeningPorts: entry.listeningPorts, currentProcess: entry.currentProcess, claudeSummary: entry.claudeSummary, lastUserMessage: entry.lastUserMessage, lastAssistantMessage: entry.lastAssistantMessage, currentAction: entry.currentAction, readyForReviewAt: entry.readyForReviewAt, busySince: entry.busySince, dismissedAt: entry.dismissedAt, claudeSessionId: entry.claudeSessionId };
        } else {
          next[tabId] = { ...DEFAULT_TAB_STATE, cliState: entry.cliState, workspaceId: entry.workspaceId, tabName: entry.tabName, panelType: entry.panelType, terminalStatus: entry.terminalStatus, listeningPorts: entry.listeningPorts, currentProcess: entry.currentProcess, claudeSummary: entry.claudeSummary, lastUserMessage: entry.lastUserMessage, lastAssistantMessage: entry.lastAssistantMessage, currentAction: entry.currentAction, readyForReviewAt: entry.readyForReviewAt, busySince: entry.busySince, dismissedAt: entry.dismissedAt, claudeSessionId: entry.claudeSessionId };
        }
      }
      // 서버에 아직 반영되지 않은 로컬 탭 보존 (split 직후 레이스 컨디션 방지)
      for (const [tabId, existing] of Object.entries(state.tabs)) {
        if (!next[tabId]) {
          next[tabId] = existing;
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
        return { tabs: updateTab(state.tabs, tabId, { cliState: update.cliState, workspaceId: update.workspaceId, tabName: update.tabName, panelType: update.panelType ?? existing.panelType, terminalStatus: update.terminalStatus, listeningPorts: update.listeningPorts, currentProcess: update.currentProcess, claudeSummary: update.claudeSummary, lastUserMessage: update.lastUserMessage, lastAssistantMessage: update.lastAssistantMessage, currentAction: update.currentAction, readyForReviewAt: update.readyForReviewAt, busySince: update.busySince, dismissedAt: update.dismissedAt, claudeSessionId: update.claudeSessionId }) };
      }
      return {
        tabs: {
          ...state.tabs,
          [tabId]: { ...DEFAULT_TAB_STATE, cliState: update.cliState, workspaceId: update.workspaceId, tabName: update.tabName, panelType: update.panelType, terminalStatus: update.terminalStatus, listeningPorts: update.listeningPorts, currentProcess: update.currentProcess, claudeSummary: update.claudeSummary, lastUserMessage: update.lastUserMessage, lastAssistantMessage: update.lastAssistantMessage, readyForReviewAt: update.readyForReviewAt, busySince: update.busySince, dismissedAt: update.dismissedAt, claudeSessionId: update.claudeSessionId },
        },
      };
    }),
}));


// --- helpers ---

export const isCliIdle = (cliState: TCliState): boolean =>
  cliState === 'idle' || cliState === 'ready-for-review';

// --- 파생 selectors ---

export const selectSessionView = (tabs: Record<string, ITabState>, tabId: string): TSessionView => {
  const tab = tabs[tabId];
  if (!tab) return 'loading';

  if (tab.isRestarting) return 'restarting';
  if (tab.claudeStatus === 'not-installed') return 'not-installed';

  if (tab.claudeStatus === 'unknown' || tab.claudeStatus === 'starting') return 'loading';

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
  if (tab.cliState === 'ready-for-review') return 'ready-for-review';
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
    else if (entry.cliState === 'ready-for-review' || entry.cliState === 'needs-input') attentionCount++;
  }
  return { busyCount, attentionCount };
};

export const selectWorkspacePortsLabel = (
  tabs: Record<string, ITabState>,
  wsId: string,
): string => {
  const ports = new Set<number>();
  for (const entry of Object.values(tabs)) {
    if (entry.workspaceId !== wsId) continue;
    if (entry.listeningPorts) {
      for (const p of entry.listeningPorts) ports.add(p);
    }
  }
  if (ports.size === 0) return '';
  return ':' + [...ports].sort((a, b) => a - b).join(', :');
};

export const selectGlobalStatus = (
  tabs: Record<string, ITabState>,
): { busyCount: number; attentionCount: number } => {
  let busyCount = 0;
  let attentionCount = 0;
  for (const entry of Object.values(tabs)) {
    if (entry.cliState === 'busy') busyCount++;
    else if (entry.cliState === 'ready-for-review' || entry.cliState === 'needs-input') attentionCount++;
  }
  return { busyCount, attentionCount };
};

export default useTabStore;
