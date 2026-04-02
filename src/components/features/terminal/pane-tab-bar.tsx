import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ITab, TPanelType } from '@/types/terminal';
import useTabDrag from '@/hooks/use-tab-drag';
import PaneTabItem from '@/components/features/terminal/pane-tab-item';
import PaneNewTabMenu from '@/components/features/terminal/pane-new-tab-menu';

interface IPaneTabBarProps {
  paneId: string;
  tabs: ITab[];
  activeTabId: string | null;
  tabTitles?: Record<string, string>;
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  paneCount: number;
  canSplit: boolean;
  isSplitting: boolean;
  onSwitchTab: (tabId: string) => void;
  onCreateTab: (panelType?: TPanelType, options?: { command?: string }) => void;
  onDeleteTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onReorderTabs: (tabIds: string[]) => void;
  onClosePane: () => void;
  onSplitPane: (orientation: 'horizontal' | 'vertical') => void;
  onMoveTab: (tabId: string, fromPaneId: string, toIndex: number) => void;
  onFocusPane: () => void;
  onRetry: () => void;
}

const PaneTabBar = ({
  paneId,
  tabs,
  activeTabId,
  tabTitles,
  isLoading,
  error,
  isCreating,
  paneCount,
  canSplit,
  isSplitting,
  onSwitchTab,
  onCreateTab,
  onDeleteTab,
  onRenameTab,
  onReorderTabs,
  onClosePane,
  onSplitPane,
  onMoveTab,
  onFocusPane,
  onRetry,
}: IPaneTabBarProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const sortedTabs = useMemo(() => [...tabs].sort((a, b) => a.order - b.order), [tabs]);

  const {
    draggedTabId,
    dropTarget,
    isDragOverFromOther,
    handleDragOver,
    handleDrop,
    handleTabBarDragEnter,
    handleTabBarDragLeave,
    startDrag,
    endDrag,
    clearDropTarget,
  } = useTabDrag({ paneId, sortedTabs, onReorderTabs, onMoveTab });

  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const hasOverflow = showLeftArrow || showRightArrow;

  const checkOverflow = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setShowLeftArrow(el.scrollLeft > 0);
    setShowRightArrow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    checkOverflow();
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(checkOverflow);
    observer.observe(el);
    return () => observer.disconnect();
  }, [checkOverflow, tabs]);

  useEffect(() => {
    if (!activeTabId || !scrollRef.current) return;
    const activeEl = scrollRef.current.querySelector(`[data-tab-id="${activeTabId}"]`);
    activeEl?.scrollIntoView({ behavior: 'instant', inline: 'nearest', block: 'nearest' });
  }, [activeTabId]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const delta = e.deltaY || e.deltaX;
      if (delta === 0) return;
      e.preventDefault();
      el.scrollLeft += delta;
      checkOverflow();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [checkOverflow]);

  const scrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
  };

  const handleRenameTab = (tabId: string, name: string) => {
    if (!name) {
      const maxNum = tabs
        .map((t) => t.name)
        .filter((n) => /^Terminal \d+$/.test(n))
        .map((n) => parseInt(n.replace('Terminal ', ''), 10))
        .reduce((max, n) => Math.max(max, n), 0);
      onRenameTab(tabId, `Terminal ${maxNum + 1}`);
      return;
    }
    onRenameTab(tabId, name);
  };

  if (error) {
    return (
      <div className="flex h-[36px] shrink-0 items-center gap-2 bg-background px-3">
        <AlertTriangle className="h-3.5 w-3.5 text-ui-amber" />
        <span className="text-xs text-muted-foreground">{error}</span>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-2 text-xs text-foreground hover:text-foreground"
          onClick={onRetry}
        >
          재시도
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[36px] shrink-0 items-center gap-1.5 bg-background px-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-4 w-16 animate-pulse rounded bg-muted" />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-[36px] shrink-0 items-stretch border-b border-border transition-colors',
        isDragOverFromOther ? 'bg-accent-color/10' : 'bg-background',
      )}
      onDragEnter={handleTabBarDragEnter}
      onDragLeave={handleTabBarDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {hasOverflow && (
        <button
          className={cn(
            'flex w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground',
            showLeftArrow ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => scrollBy(-200)}
          tabIndex={showLeftArrow ? 0 : -1}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={scrollRef}
        role="tablist"
        className="flex flex-1 items-stretch overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        onScroll={checkOverflow}
      >
        {sortedTabs.map((tab) => (
          <PaneTabItem
            key={tab.id}
            tab={tab}
            isActive={tab.id === activeTabId}
            isDragging={tab.id === draggedTabId}
            dropSide={dropTarget?.id === tab.id ? dropTarget.side : null}
            displayTitle={tabTitles?.[tab.id]}
            onSwitch={() => onSwitchTab(tab.id)}
            onDelete={() => onDeleteTab(tab.id)}
            onRename={(name) => handleRenameTab(tab.id, name)}
            onFocusPane={onFocusPane}
            onDragStart={(e) => startDrag(e, tab.id)}
            onDragEnd={endDrag}
            onDragOver={(e) => handleDragOver(e, tab.id)}
            onDragLeave={clearDropTarget}
          />
        ))}
      </div>

      {hasOverflow && (
        <button
          className={cn(
            'flex w-5 shrink-0 items-center justify-center text-muted-foreground transition-opacity hover:text-foreground',
            showRightArrow ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          onClick={() => scrollBy(200)}
          tabIndex={showRightArrow ? 0 : -1}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <TooltipProvider>
        <div className="flex shrink-0 items-stretch">
          <PaneNewTabMenu isCreating={isCreating} canSplit={canSplit} onCreateTab={onCreateTab} onSplitPane={onSplitPane} />

          {paneCount >= 2 && (
            <div className="flex items-center px-0.5">
              <Tooltip>
                <TooltipTrigger
                  className={cn(
                    'flex h-7 w-7 items-center justify-center text-muted-foreground',
                    isSplitting ? 'pointer-events-none opacity-30' : 'hover:text-foreground',
                  )}
                  disabled={isSplitting}
                  onClick={(e) => {
                    e.stopPropagation();
                    onClosePane();
                  }}
                  aria-label="탭 모두 닫기"
                >
                  <X className="h-3.5 w-3.5" />
                </TooltipTrigger>
                <TooltipContent side="bottom">탭 모두 닫기</TooltipContent>
              </Tooltip>
            </div>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
};

export default PaneTabBar;
