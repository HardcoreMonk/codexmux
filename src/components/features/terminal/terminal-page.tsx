import { Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useLayout from '@/hooks/use-layout';
import PaneLayout from '@/components/features/terminal/pane-layout';

const TerminalPage = () => {
  const {
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
    retry,
  } = useLayout();

  if (isLoading) {
    return (
      <div
        className="flex h-screen w-screen flex-col overflow-hidden"
        style={{ backgroundColor: '#1e1f29' }}
      >
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
    );
  }

  if (error) {
    return (
      <div
        className="flex h-screen w-screen flex-col items-center justify-center gap-3 overflow-hidden"
        style={{ backgroundColor: '#1e1f29' }}
      >
        <AlertTriangle className="h-5 w-5 text-ui-amber" />
        <span className="text-sm text-zinc-400">{error}</span>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={retry}>
          <RefreshCw className="h-3.5 w-3.5" />
          재시도
        </Button>
      </div>
    );
  }

  if (!layout) return null;

  return (
    <div
      className="h-screen w-screen overflow-hidden"
      style={{ backgroundColor: '#1e1f29' }}
    >
      <PaneLayout
        root={layout.root}
        focusedPaneId={layout.focusedPaneId}
        paneCount={paneCount}
        canSplit={canSplit}
        isSplitting={isSplitting}
        onSplitPane={splitPane}
        onClosePane={closePane}
        onFocusPane={focusPane}
        onUpdateRatio={updateRatio}
        onMoveTab={moveTab}
        onCreateTab={createTabInPane}
        onDeleteTab={deleteTabInPane}
        onSwitchTab={switchTabInPane}
        onRenameTab={renameTabInPane}
        onReorderTabs={reorderTabsInPane}
        onRemoveTabLocally={removeTabLocally}
      />
    </div>
  );
};

export default TerminalPage;
