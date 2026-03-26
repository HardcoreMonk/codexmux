import { useEffect } from 'react';
import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import type { ILayoutData, ITab, TPanelType } from '@/types/terminal';
import { clearInputDraft } from '@/hooks/use-web-input';
import useClaudeStatusStore from '@/hooks/use-claude-status-store';
import {
  collectPanes,
  findPane,
  removePaneWithFocus,
  updateRatioAtPath,
} from '@/lib/layout-tree';

export { collectPanes, equalizeNode, getFirstPaneId, findAdjacentPaneInDirection } from '@/lib/layout-tree';
export type { TDirection } from '@/lib/layout-tree';

const cloneLayout = (data: ILayoutData): ILayoutData =>
  JSON.parse(JSON.stringify(data));

const SESSION_PANE_PREFIX = 'pt-active-pane-';
const SESSION_TAB_PREFIX = 'pt-active-tab-';

const getSessionActivePaneId = (wsId: string): string | null => {
  try { return sessionStorage.getItem(`${SESSION_PANE_PREFIX}${wsId}`); }
  catch { return null; }
};

const getSessionActiveTabId = (paneId: string): string | null => {
  try { return sessionStorage.getItem(`${SESSION_TAB_PREFIX}${paneId}`); }
  catch { return null; }
};

const saveSessionActiveState = (wsId: string, layout: ILayoutData) => {
  try {
    if (layout.activePaneId) {
      sessionStorage.setItem(`${SESSION_PANE_PREFIX}${wsId}`, layout.activePaneId);
    }
    for (const pane of collectPanes(layout.root)) {
      if (pane.activeTabId) {
        sessionStorage.setItem(`${SESSION_TAB_PREFIX}${pane.id}`, pane.activeTabId);
      }
    }
  } catch { /* */ }
};

interface ILayoutState {
  layout: ILayoutData | null;
  isLoading: boolean;
  error: string | null;
  isSplitting: boolean;
  workspaceId: string | null;
  retryCount: number;
  paneCount: number;
  canSplit: boolean;

  setWorkspaceId: (id: string | null) => void;
  setLayout: (data: ILayoutData) => void;
  fetchLayout: (wsId?: string | null, preserveActive?: boolean) => Promise<void>;
  splitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  updateRatio: (path: number[], ratio: number) => void;
  moveTab: (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => void;
  createTabInPane: (paneId: string) => Promise<ITab | null>;
  deleteTabInPane: (paneId: string, tabId: string) => Promise<void>;
  restartTabInPane: (paneId: string, tabId: string, command?: string) => Promise<boolean>;
  switchTabInPane: (paneId: string, tabId: string) => void;
  renameTabInPane: (paneId: string, tabId: string, name: string) => Promise<void>;
  reorderTabsInPane: (paneId: string, tabIds: string[]) => void;
  removeTabLocally: (paneId: string, tabId: string) => void;
  equalizeRatios: () => void;
  updateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  clearLayout: () => void;
}

let _abortController: AbortController | null = null;
let _onFetchError: (() => void) | null = null;
let _ratioTimer: ReturnType<typeof setTimeout> | null = null;

const wsQuery = (base: string, wsId: string | null): string => {
  if (!wsId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}workspace=${wsId}`;
};

const updateDerived = (layout: ILayoutData | null, isSplitting: boolean) => {
  const paneCount = layout ? collectPanes(layout.root).length : 0;
  return { paneCount, canSplit: paneCount < 10 && !isSplitting };
};

const applyLayout = (set: (s: Partial<ILayoutState>) => void, get: () => ILayoutState, data: ILayoutData) => {
  set({ layout: data, ...updateDerived(data, get().isSplitting) });
};

const patchApi = async (url: string, body: Record<string, unknown>): Promise<ILayoutData | null> => {
  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const useLayoutStore = create<ILayoutState>((set, get) => ({
  layout: null,
  isLoading: true,
  error: null,
  isSplitting: false,
  workspaceId: null,
  retryCount: 0,
  paneCount: 0,
  canSplit: false,

  setWorkspaceId: (id) => {
    set({ workspaceId: id });
  },

  setLayout: (data) => {
    applyLayout(set, get, data);
  },

  fetchLayout: async (wsId?, preserveActive?) => {
    const targetWsId = wsId ?? get().workspaceId;
    if (!targetWsId) return;
    const shouldPreserve = preserveActive !== false;

    _abortController?.abort();
    const controller = new AbortController();
    _abortController = controller;

    if (!get().layout) {
      set({ isLoading: true, error: null });
    }
    try {
      const res = await fetch(wsQuery('/api/layout', targetWsId), { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data: ILayoutData = await res.json();
      if (controller.signal.aborted) return;

      const current = get().layout;

      if (shouldPreserve) {
        const fetchedPanes = collectPanes(data.root);
        if (current) {
          if (current.activePaneId && fetchedPanes.some((p) => p.id === current.activePaneId)) {
            data.activePaneId = current.activePaneId;
          }
          for (const pane of fetchedPanes) {
            const localPane = findPane(current.root, pane.id);
            if (localPane?.activeTabId && pane.tabs.some((t) => t.id === localPane.activeTabId)) {
              pane.activeTabId = localPane.activeTabId;
            }
          }
        } else {
          const storedPaneId = getSessionActivePaneId(targetWsId);
          if (storedPaneId && fetchedPanes.some((p) => p.id === storedPaneId)) {
            data.activePaneId = storedPaneId;
          }
          for (const pane of fetchedPanes) {
            const storedTabId = getSessionActiveTabId(pane.id);
            if (storedTabId && pane.tabs.some((t) => t.id === storedTabId)) {
              pane.activeTabId = storedTabId;
            }
          }
        }
      }

      if (current) {
        const currentContent = { root: current.root, activePaneId: current.activePaneId };
        const fetchedContent = { root: data.root, activePaneId: data.activePaneId };
        if (JSON.stringify(currentContent) === JSON.stringify(fetchedContent)) {
          return;
        }
      }
      set({ layout: data, retryCount: 0, ...updateDerived(data, get().isSplitting) });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      const retryCount = get().retryCount + 1;
      set({ retryCount });
      if (retryCount >= 3) {
        try {
          const res = await fetch(wsQuery('/api/layout/pane', targetWsId), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          if (res.ok) {
            const { paneId, tab } = await res.json();
            const fallback: ILayoutData = {
              root: { type: 'pane', id: paneId, tabs: [tab], activeTabId: tab.id },
              activePaneId: paneId,
              updatedAt: new Date().toISOString(),
            };
            set({ layout: fallback, ...updateDerived(fallback, get().isSplitting) });
            toast.info('기본 레이아웃으로 시작합니다');
            set({ retryCount: 0 });
            return;
          }
        } catch { /* fallthrough */ }
      }
      set({ error: '레이아웃을 불러올 수 없습니다' });
      _onFetchError?.();
    } finally {
      if (!controller.signal.aborted) {
        set({ isLoading: false });
      }
    }
  },

  splitPane: async (paneId, orientation) => {
    const { layout, isSplitting, workspaceId } = get();
    if (!layout || isSplitting) return;
    if (collectPanes(layout.root).length >= 10) return;

    set({ isSplitting: true, canSplit: false });
    try {
      let cwd: string | undefined;
      let panelType: string | undefined;
      const pane = findPane(layout.root, paneId);
      const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
      if (activeTab) {
        panelType = activeTab.panelType;
        try {
          const res = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`, workspaceId));
          if (res.ok) cwd = (await res.json()).cwd;
        } catch { /* fallback */ }
      }

      const res = await fetch(wsQuery('/api/layout/pane', workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourcePaneId: paneId, orientation, cwd, panelType }),
      });
      if (!res.ok) throw new Error();
      const data: ILayoutData = await res.json();
      applyLayout(set, get, data);
    } catch {
      toast.error('분할할 수 없습니다');
    } finally {
      set((s) => ({ isSplitting: false, canSplit: (s.paneCount) < 10 }));
    }
  },

  closePane: async (paneId) => {
    const { layout, workspaceId } = get();
    if (!layout) return;
    if (collectPanes(layout.root).length <= 1) return;

    try {
      const res = await fetch(wsQuery(`/api/layout/pane/${paneId}`, workspaceId), {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      const data: ILayoutData = await res.json();
      applyLayout(set, get, data);
    } catch {
      toast.error('Pane을 닫을 수 없습니다');
    }
  },

  focusPane: (paneId) => {
    const { layout, workspaceId } = get();
    if (!layout || layout.activePaneId === paneId) return;


    set({ layout: { ...layout, activePaneId: paneId } });

    patchApi(wsQuery('/api/layout', workspaceId), { activePaneId: paneId }).then((data) => {
      if (data) applyLayout(set, get, data);
    });
  },

  updateRatio: (path, ratio) => {
    const { layout, workspaceId } = get();
    if (!layout) return;


    const updated = { ...layout, root: updateRatioAtPath(layout.root, path, ratio) };
    set({ layout: updated });

    if (_ratioTimer) clearTimeout(_ratioTimer);
    _ratioTimer = setTimeout(() => {
      _ratioTimer = null;
      patchApi(wsQuery('/api/layout', workspaceId), { ratioUpdate: { path, ratio } }).then((data) => {
        if (data) applyLayout(set, get, data);
      });
    }, 300);
  },

  moveTab: (tabId, fromPaneId, toPaneId, toIndex) => {
    if (fromPaneId === toPaneId) return;
    const { layout, workspaceId } = get();
    if (!layout) return;


    const clone: ILayoutData = cloneLayout(layout);
    const fromPane = findPane(clone.root, fromPaneId);
    const toPane = findPane(clone.root, toPaneId);
    if (fromPane && toPane) {
      const tabIdx = fromPane.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx !== -1) {
        const [tab] = fromPane.tabs.splice(tabIdx, 1);
        if (fromPane.activeTabId === tabId) fromPane.activeTabId = fromPane.tabs[0]?.id ?? null;
        fromPane.tabs.forEach((t, i) => { t.order = i; });
        toPane.tabs.splice(toIndex, 0, tab);
        toPane.tabs.forEach((t, i) => { t.order = i; });
        toPane.activeTabId = tabId;
        if (fromPane.tabs.length === 0 && collectPanes(clone.root).length > 1) {
          removePaneWithFocus(clone, fromPaneId);
        }
        clone.activePaneId = toPaneId;
        applyLayout(set, get, clone);
      }
    }

    fetch(wsQuery(`/api/layout/pane/${fromPaneId}/tabs/${tabId}/move`, workspaceId), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toPaneId, toIndex }),
    }).then(async (res) => {
      if (res.ok) {
        const data: ILayoutData = await res.json();
        applyLayout(set, get, data);
      } else {
        await get().fetchLayout(undefined, false);
      }
    }).catch(() => get().fetchLayout(undefined, false));
  },

  createTabInPane: async (paneId) => {
    const { layout, workspaceId } = get();
    try {
      let cwd: string | undefined;
      let panelType: TPanelType | undefined;
      if (layout) {
        const pane = findPane(layout.root, paneId);
        const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
        if (activeTab) {
          panelType = activeTab.panelType;
          try {
            const cwdRes = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`, workspaceId));
            if (cwdRes.ok) cwd = (await cwdRes.json()).cwd;
          } catch { /* fallback */ }
        }
      }

      const res = await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs`, workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd, panelType }),
      });
      if (!res.ok) throw new Error();
      const newTab: ITab = await res.json();

      await get().fetchLayout(undefined, false);
      return newTab;
    } catch {
      toast.error('탭을 생성할 수 없습니다');
      return null;
    }
  },

  deleteTabInPane: async (paneId, tabId) => {
    clearInputDraft(tabId);
    const { workspaceId } = get();
    try {
      const res = await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), { method: 'DELETE' });
      if (!res.ok && res.status !== 404) {
        toast.error('탭 삭제 중 오류가 발생했습니다');
        return;
      }
    } catch {
      toast.error('탭 삭제 중 오류가 발생했습니다');
      return;
    }
    await get().fetchLayout();
  },

  restartTabInPane: async (paneId, tabId, command?) => {
    const { workspaceId } = get();
    try {
      const res = await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), {
        method: 'POST',
        headers: command ? { 'Content-Type': 'application/json' } : undefined,
        body: command ? JSON.stringify({ command }) : undefined,
      });
      return res.ok;
    } catch {
      toast.error('세션을 재시작할 수 없습니다');
      return false;
    }
  },

  switchTabInPane: (paneId, tabId) => {
    const { layout, workspaceId } = get();
    if (!layout) return;

    const clone = cloneLayout(layout);
    const pane = findPane(clone.root, paneId);
    if (pane) {
      pane.activeTabId = tabId;
      applyLayout(set, get, clone);
    }

    patchApi(wsQuery(`/api/layout/pane/${paneId}`, workspaceId), { activeTabId: tabId }).then((data) => {
      if (data) applyLayout(set, get, data);
    });
  },

  renameTabInPane: async (paneId, tabId, name) => {
    const { layout, workspaceId } = get();


    if (layout) {
      const clone: ILayoutData = cloneLayout(layout);
      const pane = findPane(clone.root, paneId);
      if (pane) {
        const tab = pane.tabs.find((t) => t.id === tabId);
        if (tab) tab.name = name;
        applyLayout(set, get, clone);
      }
    }

    const data = await patchApi(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), { name });
    if (data) {
      applyLayout(set, get, data);
    } else {
      toast.error('탭 이름 변경에 실패했습니다');
    }
  },

  reorderTabsInPane: (paneId, tabIds) => {
    const { layout, workspaceId } = get();
    if (!layout) return;


    const clone: ILayoutData = cloneLayout(layout);
    const pane = findPane(clone.root, paneId);
    if (pane) {
      const tabMap = new Map(pane.tabs.map((t) => [t.id, t]));
      pane.tabs = tabIds
        .map((id, i) => {
          const tab = tabMap.get(id);
          return tab ? { ...tab, order: i } : null;
        })
        .filter((t): t is ITab => t !== null);
      applyLayout(set, get, clone);
    }

    patchApi(wsQuery(`/api/layout/pane/${paneId}/tabs/order`, workspaceId), { tabIds }).then((data) => {
      if (data) applyLayout(set, get, data);
    });
  },

  removeTabLocally: (paneId, tabId) => {
    clearInputDraft(tabId);
    const { workspaceId } = get();

    fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), { method: 'DELETE' })
      .then(() => get().fetchLayout())
      .catch(() => {
        console.log('[layout] removeTabLocally failed');
      });
  },

  equalizeRatios: () => {
    const { workspaceId } = get();

    patchApi(wsQuery('/api/layout', workspaceId), { equalize: true }).then((data) => {
      if (data) applyLayout(set, get, data);
    });
  },

  updateTabPanelType: (paneId, tabId, panelType) => {
    const { layout, workspaceId } = get();
    if (!layout) return;


    const clone: ILayoutData = cloneLayout(layout);
    const pane = findPane(clone.root, paneId);
    if (pane) {
      const tab = pane.tabs.find((t) => t.id === tabId);
      if (tab) {
        tab.panelType = panelType;
        if (panelType === 'terminal') tab.claudeSessionId = null;
      }
      applyLayout(set, get, clone);
    }

    patchApi(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), { panelType }).then((data) => {
      if (data) applyLayout(set, get, data);
    });
  },

  clearLayout: () => {
    set({ layout: null, paneCount: 0, canSplit: false });
  },
}));

useLayoutStore.subscribe((state, prevState) => {
  if (!state.layout || !state.workspaceId) return;
  if (state.layout === prevState.layout) return;
  saveSessionActiveState(state.workspaceId, state.layout);
});

export const setOnFetchError = (fn: (() => void) | null): void => {
  _onFetchError = fn;
};


const useLayout = ({ workspaceId, onFetchError }: { workspaceId: string | null; onFetchError?: () => void }) => {
  useEffect(() => {
    setOnFetchError(onFetchError ?? null);
  }, [onFetchError]);

  useEffect(() => {
    if (workspaceId) {
      const store = useLayoutStore.getState();
      store.setWorkspaceId(workspaceId);
      store.fetchLayout(workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    return useLayoutStore.subscribe((state) => {
      const wsId = state.workspaceId;
      if (!wsId || !state.layout?.root) return;
      const tabIds = collectPanes(state.layout.root).flatMap((p) => p.tabs.map((t) => t.id));
      useClaudeStatusStore.getState().setTabOrder(wsId, tabIds);
    });
  }, []);

  return useLayoutStore(useShallow((s) => ({
    layout: s.layout,
    isLoading: s.isLoading,
    error: s.error,
    isSplitting: s.isSplitting,
    paneCount: s.paneCount,
    canSplit: s.canSplit,
    splitPane: s.splitPane,
    closePane: s.closePane,
    focusPane: s.focusPane,
    updateRatio: s.updateRatio,
    moveTab: s.moveTab,
    createTabInPane: s.createTabInPane,
    deleteTabInPane: s.deleteTabInPane,
    restartTabInPane: s.restartTabInPane,
    switchTabInPane: s.switchTabInPane,
    renameTabInPane: s.renameTabInPane,
    reorderTabsInPane: s.reorderTabsInPane,
    removeTabLocally: s.removeTabLocally,
    equalizeRatios: s.equalizeRatios,
    updateTabPanelType: s.updateTabPanelType,
    clearLayout: s.clearLayout,
    fetchLayout: s.fetchLayout,
  })));
};

export { useLayoutStore };
export default useLayout;
