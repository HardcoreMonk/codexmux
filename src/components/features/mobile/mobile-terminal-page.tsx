import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Monitor } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useLayout, { collectPanes } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import type { ITabMetadata } from '@/hooks/use-tab-metadata-store';
import type { TPanelType } from '@/types/terminal';
import MobileNavBar from '@/components/features/mobile/mobile-nav-bar';
import MobileSurfaceView from '@/components/features/mobile/mobile-surface-view';
import MobileTabIndicator from '@/components/features/mobile/mobile-tab-indicator';
import MobileNavigationSheet from '@/components/features/mobile/mobile-navigation-sheet';

const MobileTerminalPage = () => {
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const error = useWorkspaceStore((s) => s.error);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspaceCount = workspaces.length;
  const prevWorkspaceIdRef = useRef<string | null>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [selectedPaneId, setSelectedPaneId] = useState<string | null>(null);
  const [selectedTabId, setSelectedTabId] = useState<string | null>(null);

  const handleFetchError = useCallback(() => {
    const prevId = prevWorkspaceIdRef.current;
    if (prevId) {
      useWorkspaceStore.getState().switchWorkspace(prevId);
      toast.error('전환할 수 없습니다');
    }
  }, []);

  const layout = useLayout({
    workspaceId: activeWorkspaceId,
    onFetchError: handleFetchError,
  });

  const panes = useMemo(() => {
    if (!layout.layout) return [];
    return collectPanes(layout.layout.root);
  }, [layout.layout]);

  const allTabsEmpty = !!(
    layout.layout &&
    !layout.isLoading &&
    panes.every((p) => p.tabs.length === 0)
  );

  // Hydrate tab metadata from layout
  const layoutUpdatedAt = layout.layout?.updatedAt;
  const hydratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!layout.layout || !layoutUpdatedAt) return;
    if (hydratedRef.current === layoutUpdatedAt) return;
    hydratedRef.current = layoutUpdatedAt;
    const metadata: Record<string, ITabMetadata> = {};
    for (const pane of collectPanes(layout.layout.root)) {
      for (const tab of pane.tabs) {
        if (tab.title || tab.cwd) {
          metadata[tab.id] = { title: tab.title, cwd: tab.cwd };
        }
      }
    }
    useTabMetadataStore.getState().hydrate(metadata);
  }, [layoutUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup stale metadata
  useEffect(() => {
    if (!layout.layout) return;
    const allTabIds = new Set(
      collectPanes(layout.layout.root).flatMap((p) => p.tabs.map((t) => t.id)),
    );
    useTabMetadataStore.getState().retainOnly(allTabIds);
  }, [layout.layout]);

  // Auto-delete empty workspace
  useEffect(() => {
    if (!allTabsEmpty) return;
    const { activeWorkspaceId: wsId, workspaces: wsList, switchWorkspace, deleteWorkspace, removeWorkspace } =
      useWorkspaceStore.getState();
    if (!wsId) return;

    const idx = wsList.findIndex((w) => w.id === wsId);
    const adjacent = wsList[idx + 1] || wsList[idx - 1];

    layout.clearLayout();
    removeWorkspace(wsId);

    if (adjacent) switchWorkspace(adjacent.id);
    deleteWorkspace(wsId);
  }, [allTabsEmpty, layout.clearLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first pane/tab when layout loads
  useEffect(() => {
    if (!layout.layout || panes.length === 0) return;

    const focusedPaneId = layout.layout.focusedPaneId;
    const focusedPane = focusedPaneId
      ? panes.find((p) => p.id === focusedPaneId)
      : null;
    const firstPane = focusedPane ?? panes[0];

    if (!selectedPaneId || !panes.find((p) => p.id === selectedPaneId)) {
      setSelectedPaneId(firstPane.id);
      setSelectedTabId(firstPane.activeTabId);
    }
  }, [layout.layout, panes]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      const { activeWorkspaceId: currentId } = useWorkspaceStore.getState();
      if (workspaceId === currentId) return;

      prevWorkspaceIdRef.current = currentId;
      layout.saveCurrentLayout();

      useTabMetadataStore.getState().reset();
      layout.clearLayout();
      setSelectedPaneId(null);
      setSelectedTabId(null);
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [layout],
  );

  const handleSelectSurface = useCallback(
    (paneId: string, tabId: string) => {
      setSelectedPaneId(paneId);
      setSelectedTabId(tabId);
      layout.switchTabInPane(paneId, tabId);
    },
    [layout],
  );

  const handleTogglePanelType = useCallback(() => {
    if (!selectedPaneId || !selectedTabId) return;
    const pane = panes.find((p) => p.id === selectedPaneId);
    const tab = pane?.tabs.find((t) => t.id === selectedTabId);
    const current = tab?.panelType ?? 'terminal';
    const next: TPanelType = current === 'terminal' ? 'claude-code' : 'terminal';
    layout.updateTabPanelType(selectedPaneId, selectedTabId, next);
  }, [selectedPaneId, selectedTabId, panes, layout]);

  // Derive current state
  const currentPane = panes.find((p) => p.id === selectedPaneId);
  const currentTab = currentPane?.tabs.find((t) => t.id === selectedTabId);
  const currentPanelType: TPanelType = currentTab?.panelType ?? 'terminal';

  const sortedTabs = useMemo(() => {
    if (!currentPane) return [];
    return [...currentPane.tabs].sort((a, b) => a.order - b.order);
  }, [currentPane]);

  const activeTabIndex = sortedTabs.findIndex((t) => t.id === selectedTabId);

  const handleTabIndicatorSelect = useCallback(
    (index: number) => {
      const tab = sortedTabs[index];
      if (tab && currentPane) {
        handleSelectSurface(currentPane.id, tab.id);
      }
    },
    [sortedTabs, currentPane, handleSelectSurface],
  );

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const workspaceName = activeWorkspace?.name ?? '';

  const tabMetadata = useTabMetadataStore((s) =>
    selectedTabId ? s.metadata[selectedTabId] : undefined,
  );
  const surfaceName = currentTab?.name || tabMetadata?.title || `Tab ${(currentTab?.order ?? 0) + 1}`;

  const navigationSheet = (
    <MobileNavigationSheet
      open={menuOpen}
      onOpenChange={setMenuOpen}
      workspaces={workspaces}
      activeWorkspaceId={activeWorkspaceId}
      panes={panes}
      activePaneId={selectedPaneId}
      activeTabId={selectedTabId}
      onSelectWorkspace={handleSelectWorkspace}
      onSelectSurface={handleSelectSurface}
      onCreateTab={layout.createTabInPane}
      onDeleteTab={layout.deleteTabInPane}
    />
  );

  // Loading state
  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-terminal-bg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        <span className="mt-3 text-sm text-muted-foreground">연결 중...</span>
        {navigationSheet}
      </div>
    );
  }

  // Error state
  if (error && !workspaceCount) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-terminal-bg">
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-muted-foreground">{error}</span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={useWorkspaceStore.getState().fetchWorkspaces}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
        {navigationSheet}
      </div>
    );
  }

  // Empty workspace state
  if (!activeWorkspaceId && !isLoading && !error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-terminal-bg px-6 text-center">
        <Monitor className="h-8 w-8 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Workspace 없음</span>
        <span className="text-sm text-muted-foreground">
          데스크톱에서 Workspace를 생성하세요
        </span>
        {navigationSheet}
      </div>
    );
  }

  // Layout loading
  if (!layout.layout || layout.isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-terminal-bg">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        {navigationSheet}
      </div>
    );
  }

  // Layout error
  if (layout.error && !layout.isLoading) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-terminal-bg">
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-muted-foreground">{layout.error}</span>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => layout.fetchLayout()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
        {navigationSheet}
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-terminal-bg">
      <MobileNavBar
        workspaceName={workspaceName}
        surfaceName={surfaceName}
        panelType={currentPanelType}
        onMenuOpen={() => setMenuOpen(true)}
        onTogglePanel={handleTogglePanelType}
      />

      {currentPane && selectedTabId && (
        <MobileSurfaceView
          key={`${selectedPaneId}-${selectedTabId}`}
          paneId={currentPane.id}
          tabs={currentPane.tabs}
          activeTabId={selectedTabId}
          panelType={currentPanelType}
          onCreateTab={layout.createTabInPane}
          onDeleteTab={layout.deleteTabInPane}
          onSwitchTab={(paneId, tabId) => {
            layout.switchTabInPane(paneId, tabId);
            setSelectedTabId(tabId);
          }}
          onRemoveTabLocally={layout.removeTabLocally}
          onUpdateTabPanelType={layout.updateTabPanelType}
        />
      )}

      <MobileTabIndicator
        count={sortedTabs.length}
        activeIndex={activeTabIndex >= 0 ? activeTabIndex : 0}
        onSelect={handleTabIndicatorSelect}
      />

      <div style={{ height: 'env(safe-area-inset-bottom)' }} className="shrink-0 bg-background" />

      {navigationSheet}
    </div>
  );
};

export default MobileTerminalPage;
