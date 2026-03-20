import { useEffect } from 'react';
import { create } from 'zustand';
import { toast } from 'sonner';
import type { ILayoutData, TLayoutNode, IPaneNode, ITab, TPanelType } from '@/types/terminal';

// --- Pure utility functions (exported for use by other modules) ---

export const collectPanes = (node: TLayoutNode): IPaneNode[] => {
  if (node.type === 'pane') return [node];
  return [...collectPanes(node.children[0]), ...collectPanes(node.children[1])];
};

const findPane = (node: TLayoutNode, paneId: string): IPaneNode | null => {
  if (node.type === 'pane') return node.id === paneId ? node : null;
  return findPane(node.children[0], paneId) || findPane(node.children[1], paneId);
};

const replacePane = (
  node: TLayoutNode,
  paneId: string,
  replacement: TLayoutNode,
): TLayoutNode => {
  if (node.type === 'pane') return node.id === paneId ? replacement : node;
  return {
    ...node,
    children: [
      replacePane(node.children[0], paneId, replacement),
      replacePane(node.children[1], paneId, replacement),
    ],
  };
};

export const getFirstPaneId = (node: TLayoutNode): string => {
  if (node.type === 'pane') return node.id;
  return getFirstPaneId(node.children[0]);
};

const getLastPaneId = (node: TLayoutNode): string => {
  if (node.type === 'pane') return node.id;
  return getLastPaneId(node.children[1]);
};

export type TDirection = 'left' | 'right' | 'up' | 'down';

export const findAdjacentPaneInDirection = (
  root: TLayoutNode,
  currentPaneId: string,
  direction: TDirection,
): string | null => {
  const path: { node: TLayoutNode; childIndex: number }[] = [];

  const buildPath = (node: TLayoutNode): boolean => {
    if (node.type === 'pane') return node.id === currentPaneId;
    for (let i = 0; i < 2; i++) {
      path.push({ node, childIndex: i });
      if (buildPath(node.children[i as 0 | 1])) return true;
      path.pop();
    }
    return false;
  };

  if (!buildPath(root)) return null;

  const targetOrientation =
    direction === 'left' || direction === 'right' ? 'horizontal' : 'vertical';
  const fromChildIndex = direction === 'left' || direction === 'up' ? 1 : 0;

  for (let i = path.length - 1; i >= 0; i--) {
    const { node, childIndex } = path[i];
    if (node.type !== 'split') continue;
    if (node.orientation === targetOrientation && childIndex === fromChildIndex) {
      const targetChild = node.children[(1 - fromChildIndex) as 0 | 1];
      return direction === 'left' || direction === 'up'
        ? getLastPaneId(targetChild)
        : getFirstPaneId(targetChild);
    }
  }

  return null;
};

const findAdjacentPaneId = (node: TLayoutNode, paneId: string): string | null => {
  if (node.type === 'pane') return null;
  const [left, right] = node.children;
  if (left.type === 'pane' && left.id === paneId) return getFirstPaneId(right);
  if (right.type === 'pane' && right.id === paneId) return getLastPaneId(left);
  return findAdjacentPaneId(left, paneId) || findAdjacentPaneId(right, paneId);
};

const removePaneWithFocus = (data: ILayoutData, paneId: string) => {
  const adjacent = findAdjacentPaneId(data.root, paneId);
  const result = removePaneNode(data.root, paneId);
  if (result) data.root = result;
  if (data.focusedPaneId === paneId) {
    data.focusedPaneId = adjacent ?? collectPanes(data.root)[0]?.id ?? null;
  }
};

const removePaneNode = (node: TLayoutNode, paneId: string): TLayoutNode | null => {
  if (node.type === 'pane') return null;
  const [left, right] = node.children;
  if (left.type === 'pane' && left.id === paneId) return right;
  if (right.type === 'pane' && right.id === paneId) return left;
  const leftResult = removePaneNode(left, paneId);
  if (leftResult) return { ...node, children: [leftResult, right] };
  const rightResult = removePaneNode(right, paneId);
  if (rightResult) return { ...node, children: [left, rightResult] };
  return null;
};

const updateRatioAtPath = (
  node: TLayoutNode,
  path: number[],
  ratio: number,
): TLayoutNode => {
  if (node.type !== 'split') return node;
  if (path.length === 0) return { ...node, ratio };
  const [head, ...rest] = path;
  const children: [TLayoutNode, TLayoutNode] = [node.children[0], node.children[1]];
  children[head] = updateRatioAtPath(node.children[head], rest, ratio);
  return { ...node, children };
};

const countUnits = (node: TLayoutNode, orientation: string): number => {
  if (node.type === 'pane') return 1;
  if (node.orientation !== orientation) return 1;
  return countUnits(node.children[0], orientation) + countUnits(node.children[1], orientation);
};

export const equalizeNode = (node: TLayoutNode): TLayoutNode => {
  if (node.type === 'pane') return node;
  const leftCount = countUnits(node.children[0], node.orientation);
  const rightCount = countUnits(node.children[1], node.orientation);
  const ratio = Math.round((leftCount / (leftCount + rightCount)) * 10000) / 100;
  return {
    ...node,
    ratio,
    children: [equalizeNode(node.children[0]), equalizeNode(node.children[1])],
  };
};

const cloneLayout = (data: ILayoutData): ILayoutData =>
  JSON.parse(JSON.stringify(data));

// --- Zustand store ---

interface ILayoutState {
  layout: ILayoutData | null;
  isLoading: boolean;
  error: string | null;
  isSplitting: boolean;
  workspaceId: string | null;
  paneCount: number;
  canSplit: boolean;

  setWorkspaceId: (id: string | null) => void;
  fetchLayout: (wsId?: string | null) => Promise<void>;
  updateAndSave: (updater: (data: ILayoutData) => ILayoutData) => Promise<void>;
  splitPane: (paneId: string, orientation: 'horizontal' | 'vertical') => Promise<void>;
  closePane: (paneId: string) => Promise<void>;
  focusPane: (paneId: string) => void;
  updateRatio: (path: number[], ratio: number) => void;
  moveTab: (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => void;
  createTabInPane: (paneId: string) => Promise<ITab | null>;
  deleteTabInPane: (paneId: string, tabId: string) => Promise<void>;
  switchTabInPane: (paneId: string, tabId: string) => void;
  renameTabInPane: (paneId: string, tabId: string, name: string) => Promise<void>;
  reorderTabsInPane: (paneId: string, tabIds: string[]) => void;
  removeTabLocally: (paneId: string, tabId: string) => void;
  equalizeRatios: () => void;
  updateTabPanelType: (paneId: string, tabId: string, panelType: TPanelType) => void;
  saveCurrentLayout: () => void;
  clearLayout: () => void;
}

let _retryCount = 0;
let _abortController: AbortController | null = null;
let _pendingSave: Promise<void> | null = null;
let _onFetchError: (() => void) | null = null;

const wsQuery = (base: string, wsId: string | null): string => {
  if (!wsId) return base;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}workspace=${wsId}`;
};

const saveToServer = async (data: ILayoutData, wsId: string | null) => {
  try {
    const res = await fetch(wsQuery('/api/layout', wsId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: data.root, focusedPaneId: data.focusedPaneId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[layout] 저장 실패:', res.status, body);
    }
  } catch (err) {
    console.error('[layout] 저장 중 네트워크 오류:', err);
  }
};

const updateDerived = (layout: ILayoutData | null, isSplitting: boolean) => {
  const paneCount = layout ? collectPanes(layout.root).length : 0;
  return { paneCount, canSplit: paneCount < 10 && !isSplitting };
};

const useLayoutStore = create<ILayoutState>((set, get) => ({
  layout: null,
  isLoading: true,
  error: null,
  isSplitting: false,
  workspaceId: null,
  paneCount: 0,
  canSplit: false,

  setWorkspaceId: (id) => {
    set({ workspaceId: id });
  },

  fetchLayout: async (wsId?) => {
    const targetWsId = wsId ?? get().workspaceId;
    if (!targetWsId) return;

    _abortController?.abort();
    const controller = new AbortController();
    _abortController = controller;

    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/layout?workspace=${targetWsId}`, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data: ILayoutData = await res.json();
      if (controller.signal.aborted) return;
      set({ layout: data, ...updateDerived(data, get().isSplitting) });
      _retryCount = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      _retryCount += 1;
      if (_retryCount >= 3) {
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
              focusedPaneId: paneId,
              updatedAt: new Date().toISOString(),
            };
            set({ layout: fallback, ...updateDerived(fallback, get().isSplitting) });
            fetch(wsQuery('/api/layout', targetWsId), {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ root: fallback.root, focusedPaneId: fallback.focusedPaneId }),
            }).catch(() => {});
            toast.info('기본 레이아웃으로 시작합니다');
            _retryCount = 0;
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

  updateAndSave: async (updater) => {
    const prev = get().layout;
    if (!prev) return;
    const next = updater(cloneLayout(prev));
    next.updatedAt = new Date().toISOString();
    set({ layout: next, ...updateDerived(next, get().isSplitting) });
    const promise = saveToServer(next, get().workspaceId);
    _pendingSave = promise;
    promise.finally(() => {
      if (_pendingSave === promise) _pendingSave = null;
    });
    return promise;
  },

  splitPane: async (paneId, orientation) => {
    const { layout, isSplitting, workspaceId, updateAndSave: uas } = get();
    if (!layout || isSplitting) return;
    if (collectPanes(layout.root).length >= 10) return;

    set({ isSplitting: true, canSplit: false });
    try {
      let cwd: string | undefined;
      const pane = findPane(layout.root, paneId);
      const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
      if (activeTab) {
        try {
          const res = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`, workspaceId));
          if (res.ok) cwd = (await res.json()).cwd;
        } catch { /* fallback */ }
      }

      const res = await fetch(wsQuery('/api/layout/pane', workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd }),
      });
      if (!res.ok) throw new Error();
      const { paneId: newPaneId, tab } = await res.json();

      const newPane: IPaneNode = { type: 'pane', id: newPaneId, tabs: [tab], activeTabId: tab.id };

      await uas((data) => {
        const existingPane = findPane(data.root, paneId);
        if (!existingPane) return data;
        if (cwd && activeTab) {
          const srcTab = existingPane.tabs.find((t) => t.id === activeTab.id);
          if (srcTab) srcTab.cwd = cwd;
        }
        const splitNode: TLayoutNode = {
          type: 'split', orientation, ratio: 50,
          children: [{ ...existingPane }, newPane],
        };
        data.root = replacePane(data.root, paneId, splitNode);
        data.focusedPaneId = newPaneId;
        return data;
      });
    } catch {
      toast.error('분할할 수 없습니다');
    } finally {
      set((s) => ({ isSplitting: false, canSplit: (s.paneCount) < 10 }));
    }
  },

  closePane: async (paneId) => {
    const { layout, workspaceId, updateAndSave: uas } = get();
    if (!layout) return;
    if (collectPanes(layout.root).length <= 1) return;

    const pane = findPane(layout.root, paneId);
    const sessions = pane?.tabs.map((t) => t.sessionName) ?? [];

    try {
      await fetch(wsQuery(`/api/layout/pane/${paneId}`, workspaceId), {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions }),
      });
    } catch {
      toast.error('Pane을 닫을 수 없습니다');
      return;
    }

    uas((data) => {
      removePaneWithFocus(data, paneId);
      return data;
    });
  },

  focusPane: (paneId) => {
    set((s) => {
      if (!s.layout || s.layout.focusedPaneId === paneId) return s;
      return { layout: { ...s.layout, focusedPaneId: paneId } };
    });
  },

  updateRatio: (path, ratio) => {
    get().updateAndSave((data) => {
      data.root = updateRatioAtPath(data.root, path, ratio);
      return data;
    });
  },

  moveTab: (tabId, fromPaneId, toPaneId, toIndex) => {
    if (fromPaneId === toPaneId) return;
    const { layout, workspaceId, updateAndSave: uas } = get();
    if (!layout) return;

    const from = findPane(layout.root, fromPaneId);
    const willBeEmpty = from ? from.tabs.length === 1 : false;
    const shouldClosePane = willBeEmpty && collectPanes(layout.root).length > 1;

    uas((data) => {
      const fromPane = findPane(data.root, fromPaneId);
      const toPane = findPane(data.root, toPaneId);
      if (!fromPane || !toPane) return data;

      const tabIdx = fromPane.tabs.findIndex((t) => t.id === tabId);
      if (tabIdx === -1) return data;

      const [tab] = fromPane.tabs.splice(tabIdx, 1);
      if (fromPane.activeTabId === tabId) {
        fromPane.activeTabId = fromPane.tabs[0]?.id ?? null;
      }
      fromPane.tabs.forEach((t, i) => { t.order = i; });

      toPane.tabs.splice(toIndex, 0, tab);
      toPane.tabs.forEach((t, i) => { t.order = i; });
      toPane.activeTabId = tabId;

      if (shouldClosePane) {
        const result = removePaneNode(data.root, fromPaneId);
        if (result) data.root = result;
      }

      data.focusedPaneId = toPaneId;
      return data;
    });

    if (shouldClosePane) {
      fetch(wsQuery(`/api/layout/pane/${fromPaneId}`, workspaceId), { method: 'DELETE' }).catch(() => {});
    }
  },

  createTabInPane: async (paneId) => {
    const { layout, workspaceId, updateAndSave: uas } = get();
    try {
      let cwd: string | undefined;
      let sourceTabId: string | undefined;
      if (layout) {
        const pane = findPane(layout.root, paneId);
        const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
        if (activeTab) {
          sourceTabId = activeTab.id;
          try {
            const cwdRes = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`, workspaceId));
            if (cwdRes.ok) cwd = (await cwdRes.json()).cwd;
          } catch { /* fallback */ }
        }
      }

      const res = await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs`, workspaceId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cwd }),
      });
      if (!res.ok) throw new Error();
      const newTab: ITab = await res.json();

      uas((data) => {
        const pane = findPane(data.root, paneId);
        if (pane) {
          if (cwd && sourceTabId) {
            const srcTab = pane.tabs.find((t) => t.id === sourceTabId);
            if (srcTab) srcTab.cwd = cwd;
          }
          pane.tabs.push(newTab);
          pane.activeTabId = newTab.id;
        }
        return data;
      });
      return newTab;
    } catch {
      toast.error('탭을 생성할 수 없습니다');
      return null;
    }
  },

  deleteTabInPane: async (paneId, tabId) => {
    const { workspaceId, updateAndSave: uas } = get();
    uas((data) => {
      const pane = findPane(data.root, paneId);
      if (!pane) return data;
      pane.tabs = pane.tabs.filter((t) => t.id !== tabId);
      if (pane.activeTabId === tabId) {
        pane.activeTabId = pane.tabs[0]?.id ?? null;
      }
      pane.tabs.forEach((t, i) => { t.order = i; });
      return data;
    });
    try {
      await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), { method: 'DELETE' });
    } catch {
      toast.error('탭 삭제 중 오류가 발생했습니다');
    }
  },

  switchTabInPane: (paneId, tabId) => {
    get().updateAndSave((data) => {
      const pane = findPane(data.root, paneId);
      if (pane) pane.activeTabId = tabId;
      return data;
    });
  },

  renameTabInPane: async (paneId, tabId, name) => {
    const { workspaceId, updateAndSave: uas } = get();
    uas((data) => {
      const pane = findPane(data.root, paneId);
      if (pane) {
        const tab = pane.tabs.find((t) => t.id === tabId);
        if (tab) tab.name = name;
      }
      return data;
    });
    try {
      await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`, workspaceId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch {
      toast.error('탭 이름 변경에 실패했습니다');
    }
  },

  reorderTabsInPane: (paneId, tabIds) => {
    get().updateAndSave((data) => {
      const pane = findPane(data.root, paneId);
      if (!pane) return data;
      const tabMap = new Map(pane.tabs.map((t) => [t.id, t]));
      pane.tabs = tabIds
        .map((id, i) => {
          const tab = tabMap.get(id);
          return tab ? { ...tab, order: i } : null;
        })
        .filter((t): t is ITab => t !== null);
      return data;
    });
  },

  removeTabLocally: (paneId, tabId) => {
    get().updateAndSave((data) => {
      const pane = findPane(data.root, paneId);
      if (!pane) return data;

      pane.tabs = pane.tabs.filter((t) => t.id !== tabId);
      if (pane.activeTabId === tabId) {
        pane.activeTabId = pane.tabs[0]?.id ?? null;
      }
      pane.tabs.forEach((t, i) => { t.order = i; });

      if (pane.tabs.length === 0 && collectPanes(data.root).length > 1) {
        removePaneWithFocus(data, paneId);
      }

      return data;
    });
  },

  equalizeRatios: () => {
    get().updateAndSave((data) => {
      data.root = equalizeNode(data.root);
      return data;
    });
  },

  updateTabPanelType: (paneId, tabId, panelType) => {
    get().updateAndSave((data) => {
      const pane = findPane(data.root, paneId);
      if (!pane) return data;
      const tab = pane.tabs.find((t) => t.id === tabId);
      if (tab) tab.panelType = panelType;
      return data;
    });
  },

  saveCurrentLayout: () => {
    const { layout, workspaceId } = get();
    if (!layout) return;
    fetch(wsQuery('/api/layout', workspaceId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ root: layout.root, focusedPaneId: layout.focusedPaneId }),
    }).catch(() => {});
  },

  clearLayout: () => {
    set({ layout: null, paneCount: 0, canSplit: false });
  },
}));

export const setOnFetchError = (fn: (() => void) | null): void => {
  _onFetchError = fn;
};

// --- React hook wrapper (handles lifecycle: workspace switch, beforeunload) ---

const useLayout = ({ workspaceId, onFetchError }: { workspaceId: string | null; onFetchError?: () => void }) => {
  useEffect(() => {
    setOnFetchError(onFetchError ?? null);
  }, [onFetchError]);

  useEffect(() => {
    if (workspaceId) {
      _retryCount = 0;
      useLayoutStore.getState().setWorkspaceId(workspaceId);
      useLayoutStore.getState().fetchLayout(workspaceId);
    }
  }, [workspaceId]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      const { layout, workspaceId: wsId } = useLayoutStore.getState();
      if (!layout) return;
      const blob = new Blob(
        [JSON.stringify({ root: layout.root, focusedPaneId: layout.focusedPaneId })],
        { type: 'application/json' },
      );
      navigator.sendBeacon(wsQuery('/api/layout/beacon', wsId), blob);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  return useLayoutStore();
};

export { useLayoutStore };
export default useLayout;
