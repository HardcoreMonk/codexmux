import { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { ITab } from '@/types/terminal';

interface IUseTabs {
  tabs: ITab[];
  activeTabId: string | null;
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  createTab: (name?: string) => Promise<ITab | null>;
  deleteTab: (tabId: string) => Promise<void>;
  switchTab: (tabId: string) => void;
  renameTab: (tabId: string, name: string) => Promise<void>;
  reorderTabs: (tabIds: string[]) => Promise<void>;
  removeTabLocally: (tabId: string) => void;
  retry: () => void;
}

const ACTIVE_TAB_DEBOUNCE = 300;

const useTabs = (): IUseTabs => {
  const [tabs, setTabs] = useState<ITab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const activeTabTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveActiveTab = useCallback((tabId: string) => {
    if (activeTabTimerRef.current) clearTimeout(activeTabTimerRef.current);
    activeTabTimerRef.current = setTimeout(async () => {
      try {
        await fetch('/api/tabs/active', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ activeTabId: tabId }),
        });
      } catch {
        // non-critical
      }
    }, ACTIVE_TAB_DEBOUNCE);
  }, []);

  const fetchTabs = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tabs');
      if (!res.ok) throw new Error();
      const data = await res.json();

      let tabList: ITab[] = data.tabs;
      let active: string | null = data.activeTabId;

      if (tabList.length === 0) {
        const createRes = await fetch('/api/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!createRes.ok) throw new Error();
        const newTab: ITab = await createRes.json();
        tabList = [newTab];
        active = newTab.id;
        saveActiveTab(newTab.id);
      }

      setTabs(tabList);
      setActiveTabId(active || tabList[0]?.id || null);
    } catch {
      setError('탭 목록을 불러올 수 없습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [saveActiveTab]);

  useEffect(() => {
    fetchTabs();
  }, [fetchTabs]);

  useEffect(() => {
    return () => {
      if (activeTabTimerRef.current) clearTimeout(activeTabTimerRef.current);
    };
  }, []);

  const createTab = useCallback(
    async (name?: string): Promise<ITab | null> => {
      setIsCreating(true);
      try {
        const res = await fetch('/api/tabs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error();
        const newTab: ITab = await res.json();
        setTabs((prev) => [...prev, newTab]);
        setActiveTabId(newTab.id);
        saveActiveTab(newTab.id);
        return newTab;
      } catch {
        toast.error('탭을 생성할 수 없습니다');
        return null;
      } finally {
        setIsCreating(false);
      }
    },
    [saveActiveTab],
  );

  const deleteTab = useCallback(async (tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
    try {
      await fetch(`/api/tabs/${tabId}`, { method: 'DELETE' });
    } catch {
      toast.error('탭 삭제 중 오류가 발생했습니다');
    }
  }, []);

  const switchTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId);
      saveActiveTab(tabId);
    },
    [saveActiveTab],
  );

  const renameTab = useCallback(async (tabId: string, name: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, name } : t)));
    try {
      const res = await fetch(`/api/tabs/${tabId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('탭 이름 변경에 실패했습니다');
    }
  }, []);

  const reorderTabs = useCallback(async (tabIds: string[]) => {
    setTabs((prev) => {
      const map = new Map(prev.map((t) => [t.id, t]));
      return tabIds
        .map((id, i) => {
          const tab = map.get(id);
          return tab ? { ...tab, order: i } : null;
        })
        .filter((t): t is ITab => t !== null);
    });
    try {
      const res = await fetch('/api/tabs/order', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tabIds }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('탭 순서 변경에 실패했습니다');
    }
  }, []);

  const removeTabLocally = useCallback((tabId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== tabId));
  }, []);

  return {
    tabs,
    activeTabId,
    isLoading,
    error,
    isCreating,
    createTab,
    deleteTab,
    switchTab,
    renameTab,
    reorderTabs,
    removeTabLocally,
    retry: fetchTabs,
  };
};

export default useTabs;
