import { useState, useCallback, useRef, useEffect } from 'react';
import { Loader2, AlertTriangle, RefreshCw, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import useLayout, { collectPanes } from '@/hooks/use-layout';
import useWorkspace, { type IWorkspaceInitialData } from '@/hooks/use-workspace';
import useKeyboardShortcuts from '@/hooks/use-keyboard-shortcuts';
import PaneLayout from '@/components/features/terminal/pane-layout';
import Sidebar from '@/components/features/terminal/sidebar';

interface ITerminalPageProps {
  initialWorkspace?: IWorkspaceInitialData;
}

const TerminalPage = ({ initialWorkspace }: ITerminalPageProps) => {
  const ws = useWorkspace(initialWorkspace);
  const prevWorkspaceIdRef = useRef<string | null>(null);
  const switchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const switchDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fadeOut, setFadeOut] = useState(false);

  const handleFetchError = useCallback(() => {
    const prevId = prevWorkspaceIdRef.current;
    if (prevId) {
      ws.switchWorkspace(prevId);
      toast.error('전환할 수 없습니다');
    }
  }, [ws]);

  const layout = useLayout({
    workspaceId: ws.activeWorkspaceId,
    onFetchError: handleFetchError,
  });

  const allTabsEmpty = !!(
    layout.layout &&
    !layout.isLoading &&
    collectPanes(layout.layout.root).every((p) => p.tabs.length === 0)
  );

  const wsRef = useRef(ws);
  useEffect(() => {
    wsRef.current = ws;
  });

  useEffect(() => {
    if (!allTabsEmpty) return;

    const { activeWorkspaceId, workspaces, switchWorkspace, deleteWorkspace, removeWorkspace } = wsRef.current;
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
      if (workspaceId === ws.activeWorkspaceId) return;

      prevWorkspaceIdRef.current = ws.activeWorkspaceId;
      layout.saveCurrentLayout();

      if (switchTimeoutRef.current) clearTimeout(switchTimeoutRef.current);
      if (switchDelayRef.current) clearTimeout(switchDelayRef.current);
      setFadeOut(true);
      switchTimeoutRef.current = setTimeout(() => {
        layout.clearLayout();
        // WebSocket close 프레임이 서버에 도달할 시간을 확보한 뒤 새 워크스페이스 연결
        switchDelayRef.current = setTimeout(() => {
          ws.switchWorkspace(workspaceId);
          setFadeOut(false);
        }, 50);
      }, 100);
    },
    [ws, layout],
  );

  useKeyboardShortcuts({ layout, ws, onSelectWorkspace: handleSelectWorkspace });

  // Loading: workspace list not loaded yet
  if (ws.isLoading) {
    return (
      <div className="flex h-screen w-screen overflow-hidden bg-terminal-bg">
        {/* Sidebar skeleton */}
        <div className="flex w-[200px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
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

        {/* Main area loading */}
        <div className="flex flex-1 flex-col">
          <div className="flex h-[30px] shrink-0 items-center gap-1.5 border-b border-border bg-card px-2">
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

  // Error: workspace list failed
  if (ws.error && !ws.workspaces.length) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 overflow-hidden bg-terminal-bg">
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-muted-foreground">{ws.error}</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={ws.retry}>
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
      </div>
    );
  }

  const showSwitching = !layout.layout && layout.isLoading && ws.activeWorkspaceId;

  return (
    <div className="relative flex h-screen w-screen overflow-hidden bg-terminal-bg">
      <Sidebar
        workspaces={ws.workspaces}
        activeWorkspaceId={ws.activeWorkspaceId}
        collapsed={ws.sidebarCollapsed}
        width={ws.sidebarWidth}
        isLoading={false}
        error={null}
        onToggleCollapse={ws.toggleSidebar}
        onWidthChange={ws.setSidebarWidth}
        onWidthDragEnd={ws.saveSidebarWidth}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={ws.createWorkspace}
        onDeleteWorkspace={ws.deleteWorkspace}
        onRemoveWorkspace={ws.removeWorkspace}
        onRenameWorkspace={ws.renameWorkspace}
        onRetry={ws.retry}
      />

      {/* Main area */}
      <div className="relative min-w-0 flex-1">
        {/* Switching / loading overlay */}
        {showSwitching && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-terminal-bg">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Layout error */}
        {layout.error && !layout.isLoading && (
          <div className="flex h-full flex-col items-center justify-center gap-3">
            <AlertTriangle className="h-5 w-5 text-ui-amber" />
            <span className="text-sm text-muted-foreground">{layout.error}</span>
            <Button variant="outline" size="sm" className="gap-1.5" onClick={() => layout.retry()}>
              <RefreshCw className="h-3.5 w-3.5" />
              재시도
            </Button>
          </div>
        )}

        {/* Layout ready */}
        {layout.layout && !layout.isLoading && (
          <div
            key={ws.activeWorkspaceId}
            className={`h-full ${fadeOut ? '' : 'animate-in fade-in-0 duration-100'}`}
            style={fadeOut ? { opacity: 0, transition: 'opacity 100ms ease-out' } : undefined}
          >
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
              onUpdateTabTitles={layout.updateTabTitlesInPane}
              onEqualizeRatios={layout.equalizeRatios}
            />
          </div>
        )}

        {/* No workspace */}
        {!ws.activeWorkspaceId && !ws.isLoading && !ws.error && (
          <div className="flex h-full items-center justify-center">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={async () => {
                const created = await ws.createWorkspace('');
                if (created) ws.switchWorkspace(created.id);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              새 Workspace 만들기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default TerminalPage;
