import { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import type { ILayoutData, TLayoutNode, IPaneNode, ITab, TPanelType } from '@/types/terminal';


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
  const result = removePane(data.root, paneId);
  if (result) data.root = result;
  if (data.focusedPaneId === paneId) {
    data.focusedPaneId = adjacent ?? collectPanes(data.root)[0]?.id ?? null;
  }
};

const removePane = (node: TLayoutNode, paneId: string): TLayoutNode | null => {
  if (node.type === 'pane') return null;
  const [left, right] = node.children;
  if (left.type === 'pane' && left.id === paneId) return right;
  if (right.type === 'pane' && right.id === paneId) return left;
  const leftResult = removePane(left, paneId);
  if (leftResult) return { ...node, children: [leftResult, right] };
  const rightResult = removePane(right, paneId);
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

interface IUseLayoutOptions {
  workspaceId: string | null;
  onFetchError?: () => void;
}

const useLayout = ({ workspaceId, onFetchError }: IUseLayoutOptions) => {
  const [layout, setLayout] = useState<ILayoutData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSplitting, setIsSplitting] = useState(false);

  const layoutRef = useRef<ILayoutData | null>(null);
  const retryCountRef = useRef(0);
  const workspaceIdRef = useRef(workspaceId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const onFetchErrorRef = useRef(onFetchError);

  useEffect(() => {
    onFetchErrorRef.current = onFetchError;
  }, [onFetchError]);

  useEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  useEffect(() => {
    workspaceIdRef.current = workspaceId;
  }, [workspaceId]);

  const wsQuery = useCallback(
    (base: string) => {
      const wsId = workspaceIdRef.current;
      if (!wsId) return base;
      const sep = base.includes('?') ? '&' : '?';
      return `${base}${sep}workspace=${wsId}`;
    },
    [],
  );

  const pendingSaveRef = useRef<Promise<void> | null>(null);

  const saveToServer = useCallback(async (data: ILayoutData) => {
    try {
      const res = await fetch(wsQuery('/api/layout'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          root: data.root,
          focusedPaneId: data.focusedPaneId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('[layout] 저장 실패:', res.status, body);
      }
    } catch (err) {
      console.error('[layout] 저장 중 네트워크 오류:', err);
    }
  }, [wsQuery]);

  const updateAndSave = useCallback(
    (updater: (data: ILayoutData) => ILayoutData): Promise<void> => {
      let saved: ILayoutData | null = null;
      setLayout((prev) => {
        if (!prev) return prev;
        const next = updater(cloneLayout(prev));
        next.updatedAt = new Date().toISOString();
        saved = next;
        return next;
      });
      if (saved) {
        const promise = saveToServer(saved);
        pendingSaveRef.current = promise;
        promise.finally(() => {
          if (pendingSaveRef.current === promise) {
            pendingSaveRef.current = null;
          }
        });
        return promise;
      }
      return Promise.resolve();
    },
    [saveToServer],
  );

  const createFallbackLayout = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(wsQuery('/api/layout/pane'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return false;
      const { paneId, tab } = await res.json();
      const fallback: ILayoutData = {
        root: {
          type: 'pane',
          id: paneId,
          tabs: [tab],
          activeTabId: tab.id,
        },
        focusedPaneId: paneId,
        updatedAt: new Date().toISOString(),
      };
      setLayout(fallback);
      fetch(wsQuery('/api/layout'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ root: fallback.root, focusedPaneId: fallback.focusedPaneId }),
      }).catch(() => {});
      toast.info('기본 레이아웃으로 시작합니다');
      retryCountRef.current = 0;
      return true;
    } catch {
      return false;
    }
  }, [wsQuery]);

  const fetchLayout = useCallback(async (wsId?: string | null) => {
    const targetWsId = wsId ?? workspaceIdRef.current;
    if (!targetWsId) return;

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);
    try {
      const url = `/api/layout?workspace=${targetWsId}`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error();
      const data: ILayoutData = await res.json();
      if (controller.signal.aborted) return;
      setLayout(data);
      retryCountRef.current = 0;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      retryCountRef.current += 1;
      if (retryCountRef.current >= 3) {
        const ok = await createFallbackLayout();
        if (ok) return;
      }
      setError('레이아웃을 불러올 수 없습니다');
      onFetchErrorRef.current?.();
    } finally {
      if (!controller.signal.aborted) {
        setIsLoading(false);
      }
    }
  }, [createFallbackLayout]);

  useEffect(() => {
    if (workspaceId) {
      retryCountRef.current = 0;
      fetchLayout(workspaceId);
    }
  }, [workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const handleBeforeUnload = () => {
      const current = layoutRef.current;
      if (!current) return;
      const blob = new Blob(
        [JSON.stringify({ root: current.root, focusedPaneId: current.focusedPaneId })],
        { type: 'application/json' },
      );
      navigator.sendBeacon(wsQuery('/api/layout/beacon'), blob);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [wsQuery]);


  const paneCount = layout ? collectPanes(layout.root).length : 0;
  const canSplit = paneCount < 10 && !isSplitting;

  const splitPane = useCallback(
    async (paneId: string, orientation: 'horizontal' | 'vertical') => {
      const current = layoutRef.current;
      if (!current || isSplitting) return;
      if (collectPanes(current.root).length >= 10) return;

      setIsSplitting(true);
      try {
        let cwd: string | undefined;
        const pane = findPane(current.root, paneId);
        const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
        if (activeTab) {
          try {
            const res = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`));
            if (res.ok) cwd = (await res.json()).cwd;
          } catch {
            /* fallback to no cwd */
          }
        }

        const res = await fetch(wsQuery('/api/layout/pane'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cwd }),
        });
        if (!res.ok) throw new Error();
        const { paneId: newPaneId, tab } = await res.json();

        const newPane: IPaneNode = {
          type: 'pane',
          id: newPaneId,
          tabs: [tab],
          activeTabId: tab.id,
        };

        await updateAndSave((data) => {
          const existingPane = findPane(data.root, paneId);
          if (!existingPane) return data;
          if (cwd && activeTab) {
            const srcTab = existingPane.tabs.find((t) => t.id === activeTab.id);
            if (srcTab) srcTab.cwd = cwd;
          }
          const splitNode: TLayoutNode = {
            type: 'split',
            orientation,
            ratio: 50,
            children: [{ ...existingPane }, newPane],
          };
          data.root = replacePane(data.root, paneId, splitNode);
          data.focusedPaneId = newPaneId;
          return data;
        });
      } catch {
        toast.error('분할할 수 없습니다');
      } finally {
        setIsSplitting(false);
      }
    },
    [isSplitting, updateAndSave, wsQuery],
  );

  const closePane = useCallback(
    async (paneId: string) => {
      const current = layoutRef.current;
      if (!current) return;
      if (collectPanes(current.root).length <= 1) return;

      const pane = findPane(current.root, paneId);
      const sessions = pane?.tabs.map((t) => t.sessionName) ?? [];

      try {
        await fetch(wsQuery(`/api/layout/pane/${paneId}`), {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessions }),
        });
      } catch {
        toast.error('Pane을 닫을 수 없습니다');
        return;
      }

      updateAndSave((data) => {
        removePaneWithFocus(data, paneId);
        return data;
      });
    },
    [updateAndSave, wsQuery],
  );

  const updateRatio = useCallback(
    (path: number[], ratio: number) => {
      updateAndSave((data) => {
        data.root = updateRatioAtPath(data.root, path, ratio);
        return data;
      });
    },
    [updateAndSave],
  );

  const focusPane = useCallback(
    (paneId: string) => {
      setLayout((prev) => {
        if (!prev || prev.focusedPaneId === paneId) return prev;
        return { ...prev, focusedPaneId: paneId };
      });
    },
    [],
  );

  const moveTab = useCallback(
    (tabId: string, fromPaneId: string, toPaneId: string, toIndex: number) => {
      if (fromPaneId === toPaneId) return;

      const current = layoutRef.current;
      if (!current) return;

      const from = findPane(current.root, fromPaneId);
      const willBeEmpty = from ? from.tabs.length === 1 : false;
      const shouldClosePane = willBeEmpty && collectPanes(current.root).length > 1;

      updateAndSave((data) => {
        const fromPane = findPane(data.root, fromPaneId);
        const toPane = findPane(data.root, toPaneId);
        if (!fromPane || !toPane) return data;

        const tabIdx = fromPane.tabs.findIndex((t) => t.id === tabId);
        if (tabIdx === -1) return data;

        const [tab] = fromPane.tabs.splice(tabIdx, 1);
        if (fromPane.activeTabId === tabId) {
          fromPane.activeTabId = fromPane.tabs[0]?.id ?? null;
        }
        fromPane.tabs.forEach((t, i) => {
          t.order = i;
        });

        toPane.tabs.splice(toIndex, 0, tab);
        toPane.tabs.forEach((t, i) => {
          t.order = i;
        });
        toPane.activeTabId = tabId;

        if (shouldClosePane) {
          const result = removePane(data.root, fromPaneId);
          if (result) data.root = result;
        }

        data.focusedPaneId = toPaneId;
        return data;
      });

      if (shouldClosePane) {
        fetch(wsQuery(`/api/layout/pane/${fromPaneId}`), { method: 'DELETE' }).catch(() => {});
      }
    },
    [updateAndSave, wsQuery],
  );

  const createTabInPane = useCallback(
    async (paneId: string): Promise<ITab | null> => {
      try {
        let cwd: string | undefined;
        let sourceTabId: string | undefined;
        const current = layoutRef.current;
        if (current) {
          const pane = findPane(current.root, paneId);
          const activeTab = pane?.tabs.find((t) => t.id === pane.activeTabId);
          if (activeTab) {
            sourceTabId = activeTab.id;
            try {
              const cwdRes = await fetch(wsQuery(`/api/layout/cwd?session=${activeTab.sessionName}`));
              if (cwdRes.ok) cwd = (await cwdRes.json()).cwd;
            } catch {
              /* fallback to no cwd */
            }
          }
        }

        const res = await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cwd }),
        });
        if (!res.ok) throw new Error();
        const newTab: ITab = await res.json();

        updateAndSave((data) => {
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
    [updateAndSave, wsQuery],
  );

  const deleteTabInPane = useCallback(
    async (paneId: string, tabId: string) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (!pane) return data;
        pane.tabs = pane.tabs.filter((t) => t.id !== tabId);
        if (pane.activeTabId === tabId) {
          pane.activeTabId = pane.tabs[0]?.id ?? null;
        }
        pane.tabs.forEach((t, i) => {
          t.order = i;
        });
        return data;
      });
      try {
        await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`), { method: 'DELETE' });
      } catch {
        toast.error('탭 삭제 중 오류가 발생했습니다');
      }
    },
    [updateAndSave, wsQuery],
  );

  const switchTabInPane = useCallback(
    (paneId: string, tabId: string) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (pane) pane.activeTabId = tabId;
        return data;
      });
    },
    [updateAndSave],
  );

  const renameTabInPane = useCallback(
    async (paneId: string, tabId: string, name: string) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (pane) {
          const tab = pane.tabs.find((t) => t.id === tabId);
          if (tab) tab.name = name;
        }
        return data;
      });
      try {
        await fetch(wsQuery(`/api/layout/pane/${paneId}/tabs/${tabId}`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
      } catch {
        toast.error('탭 이름 변경에 실패했습니다');
      }
    },
    [updateAndSave, wsQuery],
  );

  const reorderTabsInPane = useCallback(
    (paneId: string, tabIds: string[]) => {
      updateAndSave((data) => {
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
    [updateAndSave],
  );

  const removeTabLocally = useCallback(
    (paneId: string, tabId: string) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (!pane) return data;

        pane.tabs = pane.tabs.filter((t) => t.id !== tabId);
        if (pane.activeTabId === tabId) {
          pane.activeTabId = pane.tabs[0]?.id ?? null;
        }
        pane.tabs.forEach((t, i) => {
          t.order = i;
        });

        if (pane.tabs.length === 0 && collectPanes(data.root).length > 1) {
          removePaneWithFocus(data, paneId);
        }

        return data;
      });
    },
    [updateAndSave],
  );

  const updateTabTitlesInPane = useCallback(
    (paneId: string, titles: Record<string, string>) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (!pane) return data;
        for (const tab of pane.tabs) {
          const newTitle = titles[tab.id];
          if (newTitle !== undefined) tab.title = newTitle;
        }
        return data;
      });
    },
    [updateAndSave],
  );

  const updateTabCwdInPane = useCallback(
    (paneId: string, tabId: string, cwd: string) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (!pane) return data;
        const tab = pane.tabs.find((t) => t.id === tabId);
        if (tab && tab.cwd !== cwd) tab.cwd = cwd;
        return data;
      });
    },
    [updateAndSave],
  );

  const equalizeRatios = useCallback(() => {
    updateAndSave((data) => {
      data.root = equalizeNode(data.root);
      return data;
    });
  }, [updateAndSave]);

  const updateTabPanelType = useCallback(
    (paneId: string, tabId: string, panelType: TPanelType) => {
      updateAndSave((data) => {
        const pane = findPane(data.root, paneId);
        if (!pane) return data;
        const tab = pane.tabs.find((t) => t.id === tabId);
        if (tab) tab.panelType = panelType;
        return data;
      });
    },
    [updateAndSave],
  );

  const saveCurrentLayout = useCallback(() => {
    const current = layoutRef.current;
    if (!current) return;
    fetch(wsQuery('/api/layout'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        root: current.root,
        focusedPaneId: current.focusedPaneId,
      }),
    }).catch(() => {});
  }, [wsQuery]);

  const clearLayout = useCallback(() => {
    setLayout(null);
  }, []);

  return {
    layout,
    isLoading,
    error,
    isSplitting,
    splitPane,
    closePane,
    updateRatio,
    focusPane,
    moveTab,
    paneCount,
    canSplit,
    createTabInPane,
    deleteTabInPane,
    switchTabInPane,
    renameTabInPane,
    reorderTabsInPane,
    removeTabLocally,
    updateTabTitlesInPane,
    updateTabCwdInPane,
    equalizeRatios,
    updateTabPanelType,
    saveCurrentLayout,
    clearLayout,
    retry: fetchLayout,
  };
};

export default useLayout;
