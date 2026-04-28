import { useCallback, useRef, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import Spinner from '@/components/ui/spinner';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useLayout, { collectPanes } from '@/hooks/use-layout';
import useWorkspaceStore from '@/hooks/use-workspace-store';
import useKeyboardShortcuts from '@/hooks/use-keyboard-shortcuts';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';
import type { ITabMetadata } from '@/hooks/use-tab-metadata-store';
import { requestSync } from '@/hooks/use-agent-status';
import PaneLayout from '@/components/features/workspace/pane-layout';
import ContentHeader from '@/components/features/workspace/content-header';
import useSidebarActions from '@/hooks/use-sidebar-actions';
import { useAutoDeleteEmptyWorkspace } from '@/hooks/use-auto-delete-empty-workspace';

const TerminalPage = () => {
  const t = useTranslations('terminal');
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
      toast.error(t('cannotSwitch'));
    }
  }, [t]);

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
    requestSync();
  }, [layoutUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Cleanup stale tab metadata
  useEffect(() => {
    if (!layout.layout) return;
    const allTabIds = new Set(
      collectPanes(layout.layout.root).flatMap((p) => p.tabs.map((t) => t.id)),
    );
    useTabMetadataStore.getState().retainOnly(allTabIds);
  }, [layout.layout]);

  useAutoDeleteEmptyWorkspace(allTabsEmpty, layout.clearLayout);

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

  useEffect(() => {
    useSidebarActions.getState().register(handleSelectWorkspace);
    return () => useSidebarActions.getState().unregister();
  }, [handleSelectWorkspace]);

  useKeyboardShortcuts({ layout });

  if (isLoading) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden bg-background animate-delayed-fade-in">
        <div className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border bg-background px-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-4 w-16 animate-pulse rounded bg-muted"
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <Spinner className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">{t('connecting')}</span>
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
          {t('retryAction')}
        </Button>
      </div>
    );
  }

  const showSwitching = !layout.layout && layout.isLoading && activeWorkspaceId;

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-background">
      {layout.layout && !layout.isLoading && !allTabsEmpty && (
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
            <Spinner className="h-4 w-4 text-muted-foreground" />
          </div>
        )}

        {layout.error && !layout.isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <AlertTriangle className="h-5 w-5 text-ui-amber" />
            <span className="text-sm text-muted-foreground">{layout.error}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => layout.fetchLayout()}>
              <RefreshCw className="h-3.5 w-3.5" />
              {t('retryAction')}
            </Button>
          </div>
        )}

        {layout.layout && !layout.isLoading && !allTabsEmpty && (
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
              {t('newWorkspace')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPage;
