import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Monitor, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useLayout, { collectPanes } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import type { ITabMetadata } from '@/hooks/use-tab-metadata-store';
import type { TPanelType } from '@/types/terminal';
import MobileLayout from '@/components/features/mobile/mobile-layout';
import MobileTabHeader from '@/components/features/mobile/mobile-tab-header';
import MobileSurfaceView from '@/components/features/mobile/mobile-surface-view';
import MobileNewTabDialog from '@/components/features/mobile/mobile-new-tab-dialog';
import { formatTabTitle, isAutoTabName } from '@/lib/tab-title';
import { dismissTab } from '@/hooks/use-claude-status';
import useTabStore from '@/hooks/use-tab-store';
import type { TCliState } from '@/types/timeline';
import useConfigStore from '@/hooks/use-config-store';
import useSync from '@/hooks/use-sync';

const MobileTerminalPage = () => {
  useSync();
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const error = useWorkspaceStore((s) => s.error);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaces = useWorkspaceStore((s) => s.workspaces);
  const workspaceCount = workspaces.length;
  const prevWorkspaceIdRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!layout.layout) return;
    const allTabIds = new Set(
      collectPanes(layout.layout.root).flatMap((p) => p.tabs.map((t) => t.id)),
    );
    useTabMetadataStore.getState().retainOnly(allTabIds);
  }, [layout.layout]);

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

  const [prevLayoutSnapshot, setPrevLayoutSnapshot] = useState<{ layout: typeof layout.layout; panes: typeof panes }>({ layout: null, panes: [] });
  if (layout.layout && panes.length > 0 && (layout.layout !== prevLayoutSnapshot.layout || panes !== prevLayoutSnapshot.panes)) {
    setPrevLayoutSnapshot({ layout: layout.layout, panes });

    const activePaneId = layout.layout.activePaneId;
    const targetPane = activePaneId
      ? panes.find((p) => p.id === activePaneId)
      : null;
    const firstPane = targetPane ?? panes[0];

    const currentPane = selectedPaneId
      ? panes.find((p) => p.id === selectedPaneId)
      : null;

    if (!currentPane) {
      setSelectedPaneId(firstPane.id);
      setSelectedTabId(firstPane.activeTabId);
    } else if (selectedTabId && !currentPane.tabs.find((t) => t.id === selectedTabId)) {
      const sorted = [...currentPane.tabs].sort((a, b) => a.order - b.order);
      const adjacent = sorted[0];
      setSelectedTabId(adjacent?.id ?? currentPane.activeTabId);
    }
  }

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      const { activeWorkspaceId: currentId } = useWorkspaceStore.getState();
      if (workspaceId === currentId) return;

      prevWorkspaceIdRef.current = currentId;
      useTabMetadataStore.getState().reset();
      layout.clearLayout();
      setSelectedPaneId(null);
      setSelectedTabId(null);
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [layout],
  );

  const handleSurfaceSelected = useCallback(
    (workspaceId: string, paneId: string, tabId: string) => {
      setSelectedPaneId(paneId);
      setSelectedTabId(tabId);
      if (workspaceId === activeWorkspaceId) {
        layout.focusPane(paneId);
        layout.switchTabInPane(paneId, tabId);
      }
    },
    [activeWorkspaceId, layout],
  );

  const [newTabDialogOpen, setNewTabDialogOpen] = useState(false);
  const [claudeCliState, setClaudeCliState] = useState<TCliState>('inactive');

  const handleCliStateChange = useCallback((state: TCliState) => {
    setClaudeCliState(state);
  }, []);

  const currentPane = panes.find((p) => p.id === selectedPaneId);
  const currentTab = currentPane?.tabs.find((t) => t.id === selectedTabId);
  const currentPanelType: TPanelType = currentTab?.panelType ?? 'terminal';

  useEffect(() => {
    if (selectedTabId) dismissTab(selectedTabId);
  }, [selectedTabId]);

  useEffect(() => {
    if (!selectedTabId || currentPanelType !== 'claude-code' || claudeCliState === 'inactive') return;
    if (claudeCliState === 'idle') {
      dismissTab(selectedTabId);
    }
  }, [selectedTabId, claudeCliState, currentPanelType]);

  const currentTabNeedsAttention = useTabStore((s) => {
    if (!selectedTabId) return false;
    const entry = s.tabs[selectedTabId];
    return entry?.cliState === 'needs-attention';
  });

  useEffect(() => {
    if (currentTabNeedsAttention && selectedTabId) {
      dismissTab(selectedTabId);
    }
  }, [currentTabNeedsAttention, selectedTabId]);

  const tabMetadata = useTabMetadataStore((s) =>
    selectedTabId ? s.metadata[selectedTabId] : undefined,
  );
  const currentTabName = useMemo(() => {
    if (!currentTab) return '';
    if (currentTab.name && !isAutoTabName(currentTab.name)) return currentTab.name;
    const rawTitle = tabMetadata?.title || currentTab.title;
    const formatted = rawTitle ? formatTabTitle(rawTitle) : '';
    if (formatted) return formatted;
    return `Tab ${currentTab.order + 1}`;
  }, [currentTab, tabMetadata]);

  const handleToggleClaude = useCallback(() => {
    if (!currentPane || !selectedTabId) return;
    const nextType: TPanelType = currentPanelType === 'claude-code' ? 'terminal' : 'claude-code';
    layout.updateTabPanelType(currentPane.id, selectedTabId, nextType);
  }, [currentPane, selectedTabId, currentPanelType, layout]);

  const handleOpenNewTabDialog = useCallback(() => {
    setNewTabDialogOpen(true);
  }, []);

  const handleCreateTab = useCallback(async (panelType?: TPanelType, options?: { command?: string }) => {
    if (!currentPane) return;
    let cmd: string | undefined;
    if (options?.command === 'claude-new') {
      const dangerous = useConfigStore.getState().dangerouslySkipPermissions;
      const settings = '--settings ~/.purplemux/hooks.json';
      cmd = dangerous ? `claude ${settings} --dangerously-skip-permissions` : `claude ${settings}`;
    }
    const newTab = await layout.createTabInPane(currentPane.id, panelType, cmd);
    if (newTab) {
      if (options?.command === 'claude-new') {
        useTabStore.getState().setRestarting(newTab.id, true);
      }
      setSelectedTabId(newTab.id);
    }
  }, [currentPane, layout]);

  const handleCloseTab = useCallback(() => {
    if (!currentPane || !selectedTabId) return;
    layout.deleteTabInPane(currentPane.id, selectedTabId);
  }, [currentPane, selectedTabId, layout]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="mt-3 text-sm text-muted-foreground">연결 중...</span>
        </div>
      );
    }

    if (error && !workspaceCount) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
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
        </div>
      );
    }

    if (!activeWorkspaceId && !isLoading && !error) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <Monitor className="h-8 w-8 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">Workspace 없음</span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={async () => {
              const created = await useWorkspaceStore.getState().createWorkspace('');
              if (created) useWorkspaceStore.getState().switchWorkspace(created.id);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            새 Workspace 만들기
          </Button>
        </div>
      );
    }

    if (!layout.layout || layout.isLoading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      );
    }

    if (layout.error && !layout.isLoading) {
      return (
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
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
        </div>
      );
    }

    return (
      <>
        {currentPane && selectedTabId && (
          <MobileTabHeader
            key={selectedTabId}
            tabId={selectedTabId}
            tabName={currentTabName}
            panelType={currentPanelType}
            onToggleClaude={handleToggleClaude}
            onCreateTab={handleOpenNewTabDialog}
            onClose={handleCloseTab}
          />
        )}

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
            onCliStateChange={handleCliStateChange}
            onOpenNewTabDialog={handleOpenNewTabDialog}
          />
        )}

      </>
    );
  };

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-terminal-bg">
      <MobileLayout
        onSelectWorkspace={handleSelectWorkspace}
        onSelectSurface={handleSurfaceSelected}
        selectedPaneId={selectedPaneId}
        selectedTabId={selectedTabId}
      >
        {renderContent()}
      </MobileLayout>
      <MobileNewTabDialog
        open={newTabDialogOpen}
        onOpenChange={setNewTabDialogOpen}
        onCreateTab={handleCreateTab}
      />
    </div>
  );
};

export default MobileTerminalPage;
