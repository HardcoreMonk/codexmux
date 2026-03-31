import { useCallback, useRef, useEffect } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useLayout, { collectPanes } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useKeyboardShortcuts from '@/hooks/use-keyboard-shortcuts';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import type { ITabMetadata } from '@/hooks/use-tab-metadata-store';
import PaneLayout from '@/components/features/terminal/pane-layout';
import Sidebar from '@/components/features/terminal/sidebar';
import ContentHeader from '@/components/features/terminal/content-header';
import useSync from '@/hooks/use-sync';

const TerminalPage = () => {
  useSync();
  const isLoading = useWorkspaceStore((s) => s.isLoading);
  const error = useWorkspaceStore((s) => s.error);
  const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
  const workspaceCount = useWorkspaceStore((s) => s.workspaces.length);
  const prevWorkspaceIdRef = useRef<string | null>(null);
  const equalizeRef = useRef<(() => void) | null>(null);

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

  const allTabsEmpty = !!(
    layout.layout &&
    !layout.isLoading &&
    collectPanes(layout.layout.root).every((p) => p.tabs.length === 0)
  );

  // Hydrate store from layout data
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

  // Cleanup stale tab metadata
  useEffect(() => {
    if (!layout.layout) return;
    const allTabIds = new Set(
      collectPanes(layout.layout.root).flatMap((p) => p.tabs.map((t) => t.id)),
    );
    useTabMetadataStore.getState().retainOnly(allTabIds);
  }, [layout.layout]);

  useEffect(() => {
    if (!allTabsEmpty) return;

    const { activeWorkspaceId, workspaces, switchWorkspace, deleteWorkspace, removeWorkspace } = useWorkspaceStore.getState();
    if (!activeWorkspaceId) return;

    const idx = workspaces.findIndex((w) => w.id === activeWorkspaceId);
    const adjacent = workspaces[idx + 1] || workspaces[idx - 1];

    layout.clearLayout();
    removeWorkspace(activeWorkspaceId);

    if (adjacent) {
      switchWorkspace(adjacent.id);
    }

    deleteWorkspace(activeWorkspaceId);
  }, [allTabsEmpty, layout.clearLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      const { activeWorkspaceId } = useWorkspaceStore.getState();
      if (workspaceId === activeWorkspaceId) return;

      prevWorkspaceIdRef.current = activeWorkspaceId;
      useTabMetadataStore.getState().reset();
      layout.clearLayout();
      useWorkspaceStore.getState().switchWorkspace(workspaceId);
    },
    [layout],
  );

  useKeyboardShortcuts({ layout, onSelectWorkspace: handleSelectWorkspace });

  if (isLoading) {
    return (
      <div className="flex h-full w-full overflow-hidden bg-background">
        <div className="flex w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
          <div className="h-titlebar shrink-0" />
          <div className="flex h-9 shrink-0 items-center justify-end border-b border-sidebar-border px-2" />
          <div className="flex flex-col gap-0.5 p-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded bg-secondary"
              />
            ))}
          </div>
        </div>

        <div className="flex flex-1 flex-col">
          <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-b border-border bg-background px-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 w-16 animate-pulse rounded bg-muted"
              />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              <span className="text-sm text-muted-foreground">연결 중...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !workspaceCount) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden bg-background">
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-muted-foreground">{error}</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={useWorkspaceStore.getState().fetchWorkspaces}>
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
      </div>
    );
  }

  const showSwitching = !layout.layout && layout.isLoading && activeWorkspaceId;

  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background">
      <Sidebar onSelectWorkspace={handleSelectWorkspace} />

      <div className="relative flex min-w-0 flex-1 flex-col">
        {layout.layout && !layout.isLoading && (
          <ContentHeader
            activePaneId={layout.layout.activePaneId}
            root={layout.layout.root}
            paneCount={layout.paneCount}
            canSplit={layout.canSplit}
            isSplitting={layout.isSplitting}
            onSplitPane={layout.splitPane}
            onEqualizeRatios={() => equalizeRef.current?.()}
            onUpdateTabPanelType={layout.updateTabPanelType}
          />
        )}

        <div className="relative min-h-0 flex-1">
          {showSwitching && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-background animate-delayed-fade-in">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {layout.error && !layout.isLoading && (
            <div className="flex h-full flex-col items-center justify-center gap-3">
              <AlertTriangle className="h-5 w-5 text-ui-amber" />
              <span className="text-sm text-muted-foreground">{layout.error}</span>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={() => layout.fetchLayout()}>
                <RefreshCw className="h-3.5 w-3.5" />
                재시도
              </Button>
            </div>
          )}

          {layout.layout && !layout.isLoading && (
            <div
              key={activeWorkspaceId}
              className="h-full"
            >
              <PaneLayout
              root={layout.layout.root}
              onUpdateRatio={layout.updateRatio}
              onEqualizeRatios={layout.equalizeRatios}
              equalizeRef={equalizeRef}
            />
          </div>
        )}

          {!activeWorkspaceId && !isLoading && !error && (
            <div className="flex h-full items-center justify-center">
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
          )}
        </div>
      </div>
    </div>
  );
};

export default TerminalPage;
