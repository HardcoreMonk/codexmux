import { useCallback } from 'react';
import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useLayout from '@/hooks/use-layout';
import useWorkspace from '@/hooks/use-workspace';
import PaneLayout from '@/components/features/terminal/pane-layout';
import Sidebar from '@/components/features/terminal/sidebar';

const TerminalPage = () => {
  const ws = useWorkspace();
  const layout = useLayout({ workspaceId: ws.activeWorkspaceId });

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === ws.activeWorkspaceId) return;

      // 1. Save current layout (fire-and-forget)
      layout.saveCurrentLayout();

      // 2. Clear current layout (triggers dispose in PaneLayout)
      layout.clearLayout();

      // 3. Optimistic: switch sidebar + trigger layout re-fetch
      ws.switchWorkspace(workspaceId);
    },
    [ws, layout],
  );

  // Loading: workspace list not loaded yet
  if (ws.isLoading) {
    return (
      <div
        className="flex h-screen w-screen overflow-hidden"
        style={{ backgroundColor: '#1e1f29' }}
      >
        {/* Sidebar skeleton */}
        <div
          className="flex w-[200px] shrink-0 flex-col"
          style={{
            backgroundColor: 'oklch(0.15 0.006 286)',
            borderRight: '0.5px solid oklch(0.25 0.006 286)',
          }}
        >
          <div
            className="flex h-9 shrink-0 items-center justify-end px-2"
            style={{ borderBottom: '0.5px solid oklch(0.25 0.006 286 / 0.4)' }}
          />
          <div className="flex flex-col gap-0.5 p-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-9 animate-pulse rounded"
                style={{ backgroundColor: 'oklch(0.20 0.006 286)' }}
              />
            ))}
          </div>
        </div>

        {/* Main area loading */}
        <div className="flex flex-1 flex-col">
          <div
            className="flex h-[30px] shrink-0 items-center gap-1.5 border-b px-2"
            style={{
              backgroundColor: 'oklch(0.18 0.006 286)',
              borderColor: 'oklch(0.35 0.006 286)',
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-4 w-16 animate-pulse rounded"
                style={{ backgroundColor: 'oklch(0.24 0.006 286)' }}
              />
            ))}
          </div>
          <div className="flex flex-1 items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
              <span className="text-sm text-zinc-500">연결 중...</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Error: workspace list failed
  if (ws.error && !ws.workspaces.length) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-3 overflow-hidden"
        style={{ backgroundColor: '#1e1f29' }}
      >
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-zinc-400">{ws.error}</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={ws.retry}>
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
      </div>
    );
  }

  const showSwitching = !layout.layout && layout.isLoading && ws.activeWorkspaceId;

  return (
    <div
      className="relative flex h-screen w-screen overflow-hidden"
      style={{ backgroundColor: '#1e1f29' }}
    >
      <Sidebar
        workspaces={ws.workspaces}
        activeWorkspaceId={ws.activeWorkspaceId}
        collapsed={ws.sidebarCollapsed}
        width={ws.sidebarWidth}
        isLoading={false}
        error={null}
        onToggleCollapse={ws.toggleSidebar}
        onWidthChange={ws.setSidebarWidth}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={ws.createWorkspace}
        onDeleteWorkspace={ws.deleteWorkspace}
        onRenameWorkspace={ws.renameWorkspace}
        onValidateDirectory={ws.validateDirectory}
        onRetry={ws.retry}
      />

      {/* Main area */}
      <div className="relative min-w-0 flex-1">
        {/* Switching / loading overlay */}
        {showSwitching && (
          <div
            className="absolute inset-0 z-30 flex items-center justify-center"
            style={{ backgroundColor: '#1e1f29' }}
          >
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
            </div>
          </div>
        )}

        {/* Layout error */}
        {layout.error && !layout.isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <AlertTriangle className="h-5 w-5 text-ui-amber" />
            <span className="text-sm text-zinc-400">{layout.error}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => layout.retry()}>
              <RefreshCw className="h-3.5 w-3.5" />
              재시도
            </Button>
          </div>
        )}

        {/* Layout ready */}
        {layout.layout && !layout.isLoading && (
          <PaneLayout
            root={layout.layout.root}
            focusedPaneId={layout.layout.focusedPaneId}
            paneCount={layout.paneCount}
            canSplit={layout.canSplit}
            isSplitting={layout.isSplitting}
            onSplitPane={layout.splitPane}
            onClosePane={layout.closePane}
            onFocusPane={layout.focusPane}
            onUpdateRatio={layout.updateRatio}
            onMoveTab={layout.moveTab}
            onCreateTab={layout.createTabInPane}
            onDeleteTab={layout.deleteTabInPane}
            onSwitchTab={layout.switchTabInPane}
            onRenameTab={layout.renameTabInPane}
            onReorderTabs={layout.reorderTabsInPane}
            onRemoveTabLocally={layout.removeTabLocally}
          />
        )}

        {/* No workspace selected */}
        {!ws.activeWorkspaceId && !ws.isLoading && !ws.error && (
          <div className="flex h-full items-center justify-center">
            <span className="text-sm text-zinc-500">
              Workspace를 선택하거나 새로 추가하세요
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPage;
