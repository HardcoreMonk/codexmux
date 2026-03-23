import { useState, useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import AppHeader from '@/components/layout/app-header';
import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';
import MobileWorkspaceTabBar from '@/components/features/mobile/mobile-workspace-tab-bar';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useLayoutStore, collectPanes } from '@/hooks/use-layout';
import type { ILayoutData, IPaneNode } from '@/types/terminal';

interface IMobileLayoutProps {
  children: ReactNode;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSurface?: (workspaceId: string, paneId: string, tabId: string) => void;
  selectedPaneId?: string | null;
  selectedTabId?: string | null;
}

const MobileLayout = ({
  children,
  onSelectWorkspace,
  onSelectSurface,
  selectedPaneId,
  selectedTabId,
}: IMobileLayoutProps) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const storeLayout = useLayoutStore((s) => s.layout);
  const storeWorkspaceId = useLayoutStore((s) => s.workspaceId);

  const [layoutCache, setLayoutCache] = useState<Record<string, ILayoutData>>({});

  useEffect(() => {
    if (workspaces.length === 0) {
      useWorkspaceStore.getState().fetchWorkspaces();
    }
  }, [workspaces.length]);

  // store의 layout을 cache에 반영 (render-phase adjustment)
  const [prevStoreSnapshot, setPrevStoreSnapshot] = useState<{ layout: typeof storeLayout; wsId: typeof storeWorkspaceId }>({ layout: null, wsId: null });
  if (storeLayout && storeWorkspaceId && (storeLayout !== prevStoreSnapshot.layout || storeWorkspaceId !== prevStoreSnapshot.wsId)) {
    setPrevStoreSnapshot({ layout: storeLayout, wsId: storeWorkspaceId });
    setLayoutCache((prev) => ({ ...prev, [storeWorkspaceId]: storeLayout }));
  }

  // 초기 로드 시 모든 workspace 레이아웃 fetch (하단 탭 바용)
  const initialFetchDone = useRef(false);
  useEffect(() => {
    if (initialFetchDone.current || workspaces.length === 0) return;
    initialFetchDone.current = true;

    let cancelled = false;
    const fetchAll = async () => {
      const results = await Promise.all(
        workspaces.map(async (ws) => {
          try {
            const res = await fetch(`/api/layout?workspace=${ws.id}`);
            if (!res.ok) return null;
            const data: ILayoutData = await res.json();
            return { id: ws.id, data };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      setLayoutCache((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r.id] = r.data;
        }
        return next;
      });
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [workspaces]);

  // 메뉴 열릴 때 모든 workspace 레이아웃 refresh
  useEffect(() => {
    if (!menuOpen) return;
    let cancelled = false;

    const fetchAll = async () => {
      const toFetch = workspaces.filter((ws) => {
        if (ws.id === storeWorkspaceId && storeLayout) return false;
        return true;
      });
      if (toFetch.length === 0) return;

      const results = await Promise.all(
        toFetch.map(async (ws) => {
          try {
            const res = await fetch(`/api/layout?workspace=${ws.id}`);
            if (!res.ok) return null;
            const data: ILayoutData = await res.json();
            return { id: ws.id, data };
          } catch {
            return null;
          }
        }),
      );

      if (cancelled) return;
      setLayoutCache((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (r) next[r.id] = r.data;
        }
        return next;
      });
    };
    fetchAll();
    return () => { cancelled = true; };
  }, [menuOpen, workspaces, storeWorkspaceId, storeLayout]);

  const workspaceLayouts = useMemo(() => {
    const map: Record<string, IPaneNode[]> = {};
    for (const ws of workspaces) {
      const layout = (ws.id === storeWorkspaceId && storeLayout)
        ? storeLayout
        : layoutCache[ws.id];
      map[ws.id] = layout ? collectPanes(layout.root) : [];
    }
    return map;
  }, [workspaces, storeLayout, storeWorkspaceId, layoutCache]);

  const activeLayout = (activeWorkspaceId === storeWorkspaceId && storeLayout)
    ? storeLayout
    : (activeWorkspaceId ? layoutCache[activeWorkspaceId] : null);
  const activePanes = activeWorkspaceId ? (workspaceLayouts[activeWorkspaceId] ?? []) : [];
  const activePaneId = activeLayout?.activePaneId ?? null;
  const activePane = activePanes.find((p) => p.id === activePaneId) ?? activePanes[0];
  const activeTabId = activePane?.activeTabId ?? null;

  const handleSelectSurface = useCallback(
    async (workspaceId: string, paneId: string, tabId: string) => {
      const wsParam = `?workspace=${workspaceId}`;

      // 서버에 activePaneId + activeTabId만 PATCH (root 전송 없음)
      fetch(`/api/layout${wsParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activePaneId: paneId }),
      }).catch(() => {});

      fetch(`/api/layout/pane/${paneId}${wsParam}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeTabId: tabId }),
      }).catch(() => {});

      if (workspaceId !== activeWorkspaceId) {
        onSelectWorkspace(workspaceId);
      }

      onSelectSurface?.(workspaceId, paneId, tabId);

      setMenuOpen(false);
      if (router.pathname !== '/') {
        router.push('/');
      }
    },
    [activeWorkspaceId, onSelectWorkspace, onSelectSurface, router],
  );

  const handleCreateWorkspace = useCallback(async () => {
    const ws = await useWorkspaceStore.getState().createWorkspace('');
    if (ws) {
      setMenuOpen(false);
      onSelectWorkspace(ws.id);
    }
  }, [onSelectWorkspace]);

  return (
    <>
      <div style={{ paddingTop: 'env(safe-area-inset-top)' }} className="shrink-0">
        <AppHeader onMenuOpen={() => setMenuOpen(true)} />
      </div>
      {children}
      <MobileWorkspaceTabBar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        workspaceLayouts={workspaceLayouts}
        selectedPaneId={selectedPaneId ?? activePaneId}
        selectedTabId={selectedTabId ?? activeTabId}
        onSelect={handleSelectSurface}
      />
      <MobileNavigationSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        workspaceLayouts={workspaceLayouts}
        activePaneId={selectedPaneId ?? activePaneId}
        activeTabId={selectedTabId ?? activeTabId}
        onSelectSurface={handleSelectSurface}
        onCreateWorkspace={handleCreateWorkspace}
      />
    </>
  );
};

export default MobileLayout;
