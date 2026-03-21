import { useState, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  BarChart3,
  X,
  Terminal,
  BotMessageSquare,
} from 'lucide-react';
import { useRouter } from 'next/router';
import { cn } from '@/lib/utils';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import type { IWorkspace, IPaneNode, ITab } from '@/types/terminal';
import useTabMetadataStore from '@/hooks/use-tab-metadata-store';

interface IMobileNavigationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  panes: IPaneNode[];
  activePaneId: string | null;
  activeTabId: string | null;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectSurface: (paneId: string, tabId: string) => void;
  onCreateTab: (paneId: string) => Promise<ITab | null>;
  onDeleteTab: (paneId: string, tabId: string) => Promise<void>;
}

const MobileNavigationSheet = ({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  panes,
  activePaneId,
  activeTabId,
  onSelectWorkspace,
  onSelectSurface,
  onCreateTab,
  onDeleteTab,
}: IMobileNavigationSheetProps) => {
  const router = useRouter();
  const [creatingPaneId, setCreatingPaneId] = useState<string | null>(null);
  const [longPressTabId, setLongPressTabId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadata = useTabMetadataStore((s) => s.metadata);

  const handleSelectWorkspace = useCallback(
    (workspaceId: string) => {
      if (workspaceId === activeWorkspaceId) return;
      onSelectWorkspace(workspaceId);
    },
    [onSelectWorkspace, activeWorkspaceId],
  );

  const handleSelectSurface = useCallback(
    (paneId: string, tabId: string) => {
      onSelectSurface(paneId, tabId);
      onOpenChange(false);
    },
    [onSelectSurface, onOpenChange],
  );

  const handleCreateTab = useCallback(
    async (paneId: string) => {
      if (creatingPaneId) return;
      setCreatingPaneId(paneId);
      const tab = await onCreateTab(paneId);
      setCreatingPaneId(null);
      if (tab) {
        onSelectSurface(paneId, tab.id);
        onOpenChange(false);
      }
    },
    [creatingPaneId, onCreateTab, onSelectSurface, onOpenChange],
  );

  const handleLongPressStart = useCallback((tabId: string) => {
    longPressTimerRef.current = setTimeout(() => {
      setLongPressTabId(tabId);
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleDeleteTab = useCallback(
    async (paneId: string, tabId: string) => {
      setLongPressTabId(null);
      await onDeleteTab(paneId, tabId);
    },
    [onDeleteTab],
  );

  const handleSheetOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v);
      if (!v) setLongPressTabId(null);
    },
    [onOpenChange],
  );

  const getTabDisplayName = (tab: ITab) => {
    if (tab.name) return tab.name;
    const meta = metadata[tab.id];
    if (meta?.title) return meta.title;
    return `Tab ${tab.order + 1}`;
  };

  const renderSurfaceItem = (pane: IPaneNode, tab: ITab, indent: string) => {
    const isTabActive = pane.id === activePaneId && tab.id === activeTabId;
    const isLastTab = pane.tabs.length <= 1;
    const showClose = longPressTabId === tab.id && !isLastTab;
    const panelType = tab.panelType ?? 'terminal';
    const isClaudeCode = panelType === 'claude-code';

    return (
      <div key={tab.id} className="relative flex items-center">
        <button
          className={cn(
            'flex w-full items-center gap-2 py-2.5 pr-4 text-left text-sm transition-colors',
            indent,
            isTabActive
              ? 'font-medium text-foreground'
              : 'text-muted-foreground hover:bg-accent/50',
          )}
          onClick={() => {
            if (longPressTabId) {
              setLongPressTabId(null);
              return;
            }
            handleSelectSurface(pane.id, tab.id);
          }}
          onTouchStart={() => handleLongPressStart(tab.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          {isClaudeCode ? (
            <BotMessageSquare size={14} className="shrink-0 text-ui-purple" />
          ) : (
            <Terminal size={14} className="shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{getTabDisplayName(tab)}</span>
          {isTabActive && (
            <span className="ml-auto shrink-0 text-xs text-ui-purple">●</span>
          )}
        </button>
        {showClose && (
          <button
            className="absolute right-2 flex h-6 w-6 items-center justify-center rounded bg-destructive/10 text-destructive transition-colors hover:bg-destructive/20"
            onClick={() => handleDeleteTab(pane.id, tab.id)}
            aria-label="탭 닫기"
          >
            <X size={14} />
          </button>
        )}
      </div>
    );
  };

  const renderAddTabButton = (paneId: string, indent: string) => (
    <button
      className={cn(
        'flex w-full items-center gap-1.5 py-1.5 pr-4 text-left text-xs text-muted-foreground/70 transition-colors hover:text-muted-foreground',
        indent,
      )}
      onClick={() => handleCreateTab(paneId)}
      disabled={!!creatingPaneId}
    >
      {creatingPaneId === paneId ? (
        <Loader2 size={12} className="animate-spin" />
      ) : (
        <Plus size={12} />
      )}
      새 탭
    </button>
  );

  const renderPaneTree = () => {
    if (panes.length === 0) return null;

    const isSingleSurface = panes.length === 1 && panes[0].tabs.length === 1;

    if (isSingleSurface) {
      const pane = panes[0];
      const tab = pane.tabs[0];
      return (
        <div className="pb-1">
          {renderSurfaceItem(pane, tab, 'pl-10')}
          {renderAddTabButton(pane.id, 'pl-10')}
        </div>
      );
    }

    const isMultiPane = panes.length > 1;

    return panes.map((pane, index) => {
      const sortedTabs = [...pane.tabs].sort((a, b) => a.order - b.order);
      const surfaceIndent = isMultiPane ? 'pl-12' : 'pl-10';

      return (
        <div key={pane.id} className="pb-1">
          {isMultiPane && (
            <div className="flex items-center justify-between py-1.5 pl-8 pr-2">
              <span className="text-xs text-muted-foreground">
                Pane {index + 1}
              </span>
              <button
                className="flex h-11 w-11 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:text-muted-foreground"
                onClick={() => handleCreateTab(pane.id)}
                disabled={!!creatingPaneId}
                aria-label="새 탭 추가"
              >
                {creatingPaneId === pane.id ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Plus size={14} />
                )}
              </button>
            </div>
          )}

          {sortedTabs.map((tab) => renderSurfaceItem(pane, tab, surfaceIndent))}

          {!isMultiPane && renderAddTabButton(pane.id, surfaceIndent)}
        </div>
      );
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b px-4 py-3">
          <SheetTitle className="text-sm font-medium">Workspaces</SheetTitle>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {workspaces.map((ws) => {
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div key={ws.id}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors',
                    isActive
                      ? 'bg-muted font-medium text-foreground'
                      : 'text-foreground hover:bg-accent/50',
                  )}
                  onClick={() => handleSelectWorkspace(ws.id)}
                >
                  {isActive ? (
                    <ChevronDown
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  ) : (
                    <ChevronRight
                      size={14}
                      className="shrink-0 text-muted-foreground"
                    />
                  )}
                  <span className="truncate">{ws.name}</span>
                </button>

                {isActive && renderPaneTree()}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={() => {
              onOpenChange(false);
              router.push('/stats');
            }}
          >
            <BarChart3 size={16} />
            통계
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileNavigationSheet;
