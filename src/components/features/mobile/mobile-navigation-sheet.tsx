import { useState, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
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
import { formatTabTitle, isAutoTabName } from '@/lib/tab-title';
import TabStatusIndicator from '@/components/features/terminal/tab-status-indicator';
import WorkspaceStatusIndicator from '@/components/features/terminal/workspace-status-indicator';

interface IMobileNavigationSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaces: IWorkspace[];
  activeWorkspaceId: string | null;
  workspaceLayouts: Record<string, IPaneNode[]>;
  activePaneId: string | null;
  activeTabId: string | null;
  onSelectSurface: (workspaceId: string, paneId: string, tabId: string) => void;
  onCreateWorkspace: () => Promise<void>;
}

const MobileNavigationSheet = ({
  open,
  onOpenChange,
  workspaces,
  activeWorkspaceId,
  workspaceLayouts,
  activePaneId,
  activeTabId,
  onSelectSurface,
  onCreateWorkspace,
}: IMobileNavigationSheetProps) => {
  const router = useRouter();
  const [expandedWsId, setExpandedWsId] = useState<string | null>(activeWorkspaceId);
  const [longPressTabId, setLongPressTabId] = useState<string | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metadata = useTabMetadataStore((s) => s.metadata);

  const handleToggleWorkspace = useCallback(
    (workspaceId: string) => {
      setExpandedWsId((prev) => (prev === workspaceId ? null : workspaceId));
    },
    [],
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

  const handleSheetOpenChange = useCallback(
    (v: boolean) => {
      onOpenChange(v);
      if (!v) setLongPressTabId(null);
      if (v) setExpandedWsId(activeWorkspaceId);
    },
    [onOpenChange, activeWorkspaceId],
  );

  const getTabDisplayName = (tab: ITab) => {
    const meta = metadata[tab.id];
    const rawTitle = meta?.title || tab.title;
    const formatted = rawTitle ? formatTabTitle(rawTitle) : '';

    if (tab.name && !isAutoTabName(tab.name)) return tab.name;
    if (formatted) return formatted;
    return `Tab ${tab.order + 1}`;
  };

  const renderSurfaceItem = (workspaceId: string, pane: IPaneNode, tab: ITab, indent: string) => {
    const isCurrentWs = workspaceId === activeWorkspaceId;
    const isTabActive = isCurrentWs && pane.id === activePaneId && tab.id === activeTabId;
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
            onSelectSurface(workspaceId, pane.id, tab.id);
          }}
          onTouchStart={() => handleLongPressStart(tab.id)}
          onTouchEnd={handleLongPressEnd}
          onTouchCancel={handleLongPressEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <TabStatusIndicator
            tabId={tab.id}
            isActive={isTabActive}
            panelType={panelType}
          />
          {isClaudeCode ? (
            <BotMessageSquare size={14} className={cn('shrink-0 mt-0.5', isTabActive ? 'text-ui-purple' : 'text-muted-foreground')} />
          ) : (
            <Terminal size={14} className={cn('shrink-0', isTabActive ? 'text-foreground' : 'text-muted-foreground')} />
          )}
          <div className="min-w-0 flex-1">
            <span className="block truncate">{getTabDisplayName(tab)}</span>
            {isClaudeCode && tab.claudeSummary && (
              <span className="block truncate text-xs text-muted-foreground/70">
                {tab.claudeSummary}
              </span>
            )}
          </div>
        </button>
      </div>
    );
  };

  const renderPaneTree = (workspaceId: string) => {
    const panes = workspaceLayouts[workspaceId] ?? [];
    if (panes.length === 0) return null;

    const isMultiPane = panes.length > 1;

    return panes.map((pane, index) => {
      const sortedTabs = [...pane.tabs].sort((a, b) => a.order - b.order);
      const surfaceIndent = isMultiPane ? 'pl-12' : 'pl-10';

      return (
        <div key={pane.id} className="pb-1">
          {isMultiPane && (
            <div className="flex items-center py-1.5 pl-8 pr-2">
              <span className="text-xs text-muted-foreground">
                Pane {index + 1}
              </span>
            </div>
          )}
          {sortedTabs.map((tab) => renderSurfaceItem(workspaceId, pane, tab, surfaceIndent))}
        </div>
      );
    });
  };

  return (
    <Sheet open={open} onOpenChange={handleSheetOpenChange}>
      <SheetContent side="left" className="w-72 gap-0 p-0" showCloseButton={false}>
        <SheetHeader className="relative flex-row items-center justify-center border-b px-4 py-3">
          <button
            className="absolute left-2 flex h-11 w-11 items-center justify-center text-muted-foreground"
            onClick={() => onOpenChange(false)}
            aria-label="메뉴 닫기"
          >
            <X size={20} />
          </button>
          <SheetTitle className="text-sm font-medium">Workspaces</SheetTitle>
        </SheetHeader>

        <div
          className="flex-1 overflow-y-auto"
          style={{ scrollbarWidth: 'none' }}
        >
          {workspaces.map((ws) => {
            const isExpanded = ws.id === expandedWsId;
            const isActive = ws.id === activeWorkspaceId;
            return (
              <div key={ws.id}>
                <button
                  className={cn(
                    'flex w-full items-center gap-2 px-4 py-3 text-left text-sm transition-colors',
                    isActive
                      ? 'font-medium text-foreground'
                      : 'text-foreground hover:bg-accent/50',
                  )}
                  onClick={() => handleToggleWorkspace(ws.id)}
                >
                  {isExpanded ? (
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
                  <WorkspaceStatusIndicator workspaceId={ws.id} />
                </button>

                {isExpanded && renderPaneTree(ws.id)}
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t">
          <button
            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent"
            onClick={onCreateWorkspace}
          >
            <Plus size={16} />
            Workspace
          </button>
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
