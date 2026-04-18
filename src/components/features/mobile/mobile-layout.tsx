import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/router';
import AppHeader from '@/components/layout/app-header';
import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';
import MobileWorkspaceTabBar from '@/components/features/mobile/mobile-workspace-tab-bar';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import { useLayoutStore, collectPanes } from '@/hooks/use-layout';
import { navigateToTab } from '@/hooks/use-layout';
import SettingsDialog from '@/components/features/workspace/settings-dialog';
import useMobileLayoutActions from '@/hooks/use-mobile-layout-actions';
import type { ILayoutData, IPaneNode } from '@/types/terminal';

interface IMobileLayoutProps {
  children: ReactNode;
}

const MobileLayout = ({ children }: IMobileLayoutProps) => {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

  const storeLayout = useLayoutStore((s) => s.layout);
  const storeWorkspaceId = useLayoutStore((s) => s.workspaceId);
  const pendingFocusTabId = useLayoutStore((s) => s.pendingFocusTabId);

  const registeredSelectWorkspace = useMobileLayoutActions((s) => s.onSelectWorkspace);

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

  // workspace 레이아웃 fetch (캐시에 없는 워크스페이스 발견 시 + 메뉴 열릴 때 refresh)
  const wsIds = useMemo(() => workspaces.map((ws) => ws.id).join(','), [workspaces]);
  const uncachedWsIds = useMemo(() => {
    return workspaces
      .filter((ws) => {
        if (ws.id === storeWorkspaceId && storeLayout) return false;
        if (layoutCache[ws.id]) return false;
        return true;
      })
      .map((ws) => ws.id)
      .join(',');
  }, [workspaces, storeWorkspaceId, storeLayout, layoutCache]);

  useEffect(() => {
    if (workspaces.length === 0) return;

    const toFetch = workspaces.filter((ws) => {
      if (ws.id === storeWorkspaceId && storeLayout) return false;
      if (!menuOpen && layoutCache[ws.id]) return false;
      return true;
    });
    if (toFetch.length === 0) return;

    let cancelled = false;

    const fetchAll = async () => {
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
  }, [menuOpen, wsIds, uncachedWsIds]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const isWorkspacePage = router.pathname === '/';

  const activeLayout = (activeWorkspaceId === storeWorkspaceId && storeLayout)
    ? storeLayout
    : (activeWorkspaceId ? layoutCache[activeWorkspaceId] : null);
  const activePanes = activeWorkspaceId ? (workspaceLayouts[activeWorkspaceId] ?? []) : [];
  const derivedPaneId = isWorkspacePage ? (activeLayout?.activePaneId ?? null) : null;
  const derivedPane = activePanes.find((p) => p.id === derivedPaneId) ?? activePanes[0];
  const derivedTabId = isWorkspacePage ? (derivedPane?.activeTabId ?? null) : null;

  const pendingPane = pendingFocusTabId
    ? activePanes.find((p) => p.tabs.some((t) => t.id === pendingFocusTabId))
    : null;
  const activePaneId = pendingPane ? pendingPane.id : derivedPaneId;
  const activeTabId = pendingPane ? pendingFocusTabId : derivedTabId;

  const defaultSelectWorkspace = useCallback(
    (workspaceId: string) => {
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [],
  );

  const onSelectWorkspace = registeredSelectWorkspace ?? defaultSelectWorkspace;

  const handleSelectSurface = useCallback(
    (workspaceId: string, paneId: string, tabId: string) => {
      setMenuOpen(false);
      if (router.pathname !== '/') {
        try {
          sessionStorage.setItem(`pt-active-pane-${workspaceId}`, paneId);
          sessionStorage.setItem(`pt-active-tab-${paneId}`, tabId);
        } catch { /* */ }
      }
      navigateToTab(workspaceId, tabId);
    },
    [router.pathname],
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
        <AppHeader
          onMenuOpen={() => setMenuOpen(true)}
          workspaceName={workspaces.find((ws) => ws.id === activeWorkspaceId)?.name}
        />
      </div>
      {children}
      <MobileWorkspaceTabBar
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        workspaceLayouts={workspaceLayouts}
        selectedPaneId={activePaneId}
        selectedTabId={activeTabId}
        onSelect={handleSelectSurface}
      />
      <MobileNavigationSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        workspaceLayouts={workspaceLayouts}
        activePaneId={activePaneId}
        activeTabId={activeTabId}
        onSelectSurface={handleSelectSurface}
        onCreateWorkspace={handleCreateWorkspace}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
};

export default MobileLayout;
