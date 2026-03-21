import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  Equal,
  Terminal,
  BotMessageSquare,
  CodeXml,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const SplitVerticalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="12" y1="3" x2="12" y2="21" />
  </svg>
);

const SplitHorizontalIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <line x1="3" y1="12" x2="21" y2="12" />
  </svg>
);
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { ITab, TPanelType } from '@/types/terminal';
import { isAutoTabName } from '@/lib/tab-title';

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
  onCreateTab: () => void;
  onDeleteTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onReorderTabs: (tabIds: string[]) => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onClosePane: () => void;
  onMoveTab: (tabId: string, fromPaneId: string, toIndex: number) => void;
  onFocusPane: () => void;
  onRetry: () => void;
  onEqualizeRatios: () => void;
  activeTabCwd?: string;
  activePanelType: TPanelType;
  onTogglePanelType: () => void;
}

const PaneTabBar = ({
  paneId,
  tabs,
  activeTabId,
  tabTitles,
  activeTabCwd,
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
  onSplitHorizontal,
  onSplitVertical,
  onClosePane,
  onMoveTab,
  onFocusPane,
  onRetry,
  onEqualizeRatios,
  activePanelType,
  onTogglePanelType,
}: IPaneTabBarProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftArrow, setShowLeftArrow] = useState(false);
  const [showRightArrow, setShowRightArrow] = useState(false);
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [draggedTabId, setDraggedTabId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    id: string;
    side: 'left' | 'right';
  } | null>(null);
  const [isDragOverFromOther, setIsDragOverFromOther] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const dragEnterCountRef = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const sortedTabs = [...tabs].sort((a, b) => a.order - b.order);

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
    const activeEl = scrollRef.current.querySelector(
      `[data-tab-id="${activeTabId}"]`,
    );
    activeEl?.scrollIntoView({ behavior: 'instant', inline: 'nearest', block: 'nearest' });
  }, [activeTabId]);

  useEffect(() => {
    if (editingTabId) {
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editingTabId]);

  const handleWheel = (e: React.WheelEvent) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft += e.deltaY || e.deltaX;
    checkOverflow();
  };

  const scrollBy = (delta: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: delta, behavior: 'smooth' });
    setTimeout(checkOverflow, 300);
  };

  const startEditing = (tab: ITab) => {
    setEditingTabId(tab.id);
    setEditName(tab.name);
  };

  const confirmRename = (tabId: string) => {
    const trimmed = editName.trim();
    setEditingTabId(null);
    if (!trimmed) {
      const maxNum = tabs
        .map((t) => t.name)
        .filter((n) => /^Terminal \d+$/.test(n))
        .map((n) => parseInt(n.replace('Terminal ', ''), 10))
        .reduce((max, n) => Math.max(max, n), 0);
      onRenameTab(tabId, `Terminal ${maxNum + 1}`);
      return;
    }
    const original = tabs.find((t) => t.id === tabId);
    if (trimmed !== original?.name) {
      onRenameTab(tabId, trimmed);
    }
  };

  const getSourcePaneId = (e: React.DragEvent): string | null => {
    const types = Array.from(e.dataTransfer.types);
    const paneType = types.find((t) => t.startsWith('application/x-pane/'));
    return paneType?.replace('application/x-pane/', '') ?? null;
  };

  const isFromOtherPane = (e: React.DragEvent): boolean => {
    const sourcePaneId = getSourcePaneId(e);
    return sourcePaneId !== null && sourcePaneId !== paneId;
  };

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTarget({ id: tabId, side });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current = 0;
    setIsDragOverFromOther(false);

    const draggedId = e.dataTransfer.getData('text/tab-id');
    const sourcePaneId = e.dataTransfer.getData('text/pane-id');

    if (!draggedId) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    if (sourcePaneId && sourcePaneId !== paneId) {
      // Cross-pane move
      const toIndex = dropTarget
        ? (() => {
            const targetIdx = sortedTabs.findIndex((t) => t.id === dropTarget.id);
            return dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
          })()
        : sortedTabs.length;

      onMoveTab(draggedId, sourcePaneId, toIndex);
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    // Same-pane reorder
    if (!dropTarget || draggedId === dropTarget.id) {
      setDraggedTabId(null);
      setDropTarget(null);
      return;
    }

    const newOrder = sortedTabs.filter((t) => t.id !== draggedId);
    const targetIdx = newOrder.findIndex((t) => t.id === dropTarget.id);
    const insertIdx = dropTarget.side === 'right' ? targetIdx + 1 : targetIdx;
    const draggedTab = sortedTabs.find((t) => t.id === draggedId);
    if (draggedTab) {
      newOrder.splice(insertIdx, 0, draggedTab);
    }
    onReorderTabs(newOrder.map((t) => t.id));
    setDraggedTabId(null);
    setDropTarget(null);
  };

  const handleTabBarDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragEnterCountRef.current++;
    if (isFromOtherPane(e)) {
      setIsDragOverFromOther(true);
    }
  };

  const handleToggle = useCallback(() => {
    if (isToggling) return;
    setIsToggling(true);
    onTogglePanelType();
    setTimeout(() => setIsToggling(false), 150);
  }, [isToggling, onTogglePanelType]);

  const handleTabBarDragLeave = () => {
    dragEnterCountRef.current--;
    if (dragEnterCountRef.current <= 0) {
      dragEnterCountRef.current = 0;
      setIsDragOverFromOther(false);
      setDropTarget(null);
    }
  };

  if (error) {
    return (
      <div className="flex h-[30px] shrink-0 items-center gap-2 bg-card px-3">
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
      <div className="flex h-[30px] shrink-0 items-center gap-1.5 bg-card px-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-16 animate-pulse rounded bg-muted"
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex h-[30px] shrink-0 items-stretch border-b border-border transition-colors',
        isDragOverFromOther ? 'bg-accent-color/10' : 'bg-card',
      )}
      onDragEnter={handleTabBarDragEnter}
      onDragLeave={handleTabBarDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {showLeftArrow && (
        <button
          className="flex w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={() => scrollBy(-120)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        ref={scrollRef}
        role="tablist"
        className="flex flex-1 items-stretch overflow-x-auto"
        style={{ scrollbarWidth: 'none' }}
        onWheel={handleWheel}
        onScroll={checkOverflow}
      >
        {sortedTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDragging = tab.id === draggedTabId;
          const isEditing = tab.id === editingTabId;
          const isDropLeft = dropTarget?.id === tab.id && dropTarget.side === 'left';
          const isDropRight = dropTarget?.id === tab.id && dropTarget.side === 'right';
          const dynamicTitle = tabTitles?.[tab.id];
          const displayName = isAutoTabName(tab.name)
            ? (dynamicTitle || '')
            : tab.name;

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'group relative flex min-w-[80px] max-w-[180px] cursor-pointer items-center gap-1 border-b-2 px-3 text-xs select-none',
                isActive
                  ? 'border-b-accent-color bg-secondary text-foreground'
                  : 'border-b-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                isDragging && 'opacity-30',
              )}
              onClick={() => {
                if (!isEditing && !isActive) onSwitchTab(tab.id);
                onFocusPane();
              }}
              onDoubleClick={() => startEditing(tab)}
              draggable={!isEditing}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/tab-id', tab.id);
                e.dataTransfer.setData('text/pane-id', paneId);
                e.dataTransfer.setData(`application/x-pane/${paneId}`, '');

                const ghost = document.createElement('div');
                ghost.textContent = displayName;
                ghost.style.cssText =
                  'position:fixed;left:-9999px;padding:4px 12px;background:var(--card);color:var(--foreground);border-radius:4px;font-size:12px;opacity:0.6;transform:scale(0.9);white-space:nowrap;';
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 0, 0);
                requestAnimationFrame(() => ghost.remove());

                setDraggedTabId(tab.id);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={() => {
                setDropTarget(null);
              }}
            >
              {isDropLeft && (
                <div className="absolute top-1 bottom-1 left-0 w-0.5 bg-ui-blue" />
              )}

              {isEditing ? (
                <input
                  ref={inputRef}
                  className="w-full min-w-0 border-b border-accent-color bg-transparent text-xs text-foreground outline-none"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename(tab.id);
                    if (e.key === 'Escape') setEditingTabId(null);
                  }}
                  onBlur={() => confirmRename(tab.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  {tab.panelType === 'claude-code' ? (
                    <BotMessageSquare className="h-3 w-3 shrink-0 text-ui-purple" />
                  ) : (
                    <Terminal className="h-3 w-3 shrink-0 text-muted-foreground" />
                  )}
                  <span
                    className={cn(
                      'truncate',
                      displayName ? 'opacity-100' : 'opacity-0',
                    )}
                  >
                    {displayName}
                  </span>
                </>
              )}

              <button
                className={cn(
                  'ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground',
                  isActive ? 'visible' : 'invisible group-hover:visible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTab(tab.id);
                }}
                aria-label="탭 닫기"
              >
                <X className="h-3 w-3" />
              </button>

              {isDropRight && (
                <div className="absolute top-1 right-0 bottom-1 w-0.5 bg-ui-blue" />
              )}
            </div>
          );
        })}
      </div>

      {showRightArrow && (
        <button
          className="flex w-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
          onClick={() => scrollBy(120)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <TooltipProvider>
        <div className="flex shrink-0 items-center border-l border-border">
          {/* Add tab */}
          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-full w-[28px] items-center justify-center text-muted-foreground hover:text-foreground',
                isCreating && 'pointer-events-none opacity-50',
              )}
              onClick={onCreateTab}
              disabled={isCreating}
              aria-label="새 탭"
            >
              {isCreating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">새 탭</TooltipContent>
          </Tooltip>

          {/* Panel type toggle */}
          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground',
                activePanelType === 'claude-code' && 'text-ui-purple',
                isToggling && 'pointer-events-none opacity-80',
              )}
              onClick={handleToggle}
              disabled={isToggling}
              aria-label={activePanelType === 'terminal' ? 'Claude Code 모드로 전환' : '터미널 모드로 전환'}
            >
              {activePanelType === 'terminal' ? (
                <BotMessageSquare className="h-3 w-3" />
              ) : (
                <Terminal className="h-3 w-3" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {activePanelType === 'terminal' ? 'Claude Code 패널' : '터미널'}
            </TooltipContent>
          </Tooltip>

          {/* Open in code-server */}
          <Tooltip>
            <TooltipTrigger
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={() => {
                const folder = activeTabCwd || '/';
                const url = `${window.location.protocol}//${window.location.hostname}:8080/?folder=${encodeURIComponent(folder)}`;
                window.open(url, '_blank');
              }}
              aria-label="code-server 열기"
            >
              <CodeXml className="h-3 w-3" />
            </TooltipTrigger>
            <TooltipContent side="bottom">에디터</TooltipContent>
          </Tooltip>

          {/* Split horizontal */}
          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground',
                canSplit
                  ? 'hover:bg-accent hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit ? onSplitHorizontal : undefined}
              disabled={!canSplit}
              aria-label="수직 분할"
            >
              {isSplitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <SplitVerticalIcon className="h-3 w-3" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">수직 분할</TooltipContent>
          </Tooltip>

          {/* Split vertical */}
          <Tooltip>
            <TooltipTrigger
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground',
                canSplit
                  ? 'hover:bg-accent hover:text-foreground'
                  : 'cursor-not-allowed opacity-30',
              )}
              onClick={canSplit ? onSplitVertical : undefined}
              disabled={!canSplit}
              aria-label="수평 분할"
            >
              {isSplitting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <SplitHorizontalIcon className="h-3 w-3" />
              )}
            </TooltipTrigger>
            <TooltipContent side="bottom">수평 분할</TooltipContent>
          </Tooltip>

          {/* Equalize panes */}
          {paneCount >= 2 && (
            <Tooltip>
              <TooltipTrigger
                className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={onEqualizeRatios}
                aria-label="균등 분할"
              >
                <Equal className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent side="bottom">균등 분할</TooltipContent>
            </Tooltip>
          )}

          {/* Close pane */}
          {paneCount >= 2 && (
            <Tooltip>
              <TooltipTrigger
                className={cn(
                  'flex h-full w-[24px] items-center justify-center rounded-none text-muted-foreground',
                  isSplitting ? 'pointer-events-none opacity-30' : 'hover:bg-destructive/20 hover:text-foreground',
                )}
                disabled={isSplitting}
                onClick={(e) => {
                  e.stopPropagation();
                  onClosePane();
                }}
                aria-label="Pane 닫기"
              >
                <X className="h-3 w-3" />
              </TooltipTrigger>
              <TooltipContent side="bottom">Pane 닫기</TooltipContent>
            </Tooltip>
          )}
        </div>
      </TooltipProvider>
    </div>
  );
};

export default PaneTabBar;
