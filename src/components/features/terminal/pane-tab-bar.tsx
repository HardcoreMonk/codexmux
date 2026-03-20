import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Plus,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Loader2,
  PanelRight,
  PanelBottom,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab } from '@/types/terminal';

interface IPaneTabBarProps {
  paneId: string;
  tabs: ITab[];
  activeTabId: string | null;
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
}

const TAB_BAR_BG = 'oklch(0.18 0.006 286)';
const TAB_ACTIVE_BG = 'oklch(0.21 0.006 286)';
const TAB_HOVER_BG = 'oklch(0.24 0.006 286)';

const PaneTabBar = ({
  paneId,
  tabs,
  activeTabId,
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
  const [closingTabId, setClosingTabId] = useState<string | null>(null);
  const [isDragOverFromOther, setIsDragOverFromOther] = useState(false);
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
    activeEl?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
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
      <div
        className="flex h-[30px] shrink-0 items-center gap-2 px-3"
        style={{ backgroundColor: TAB_BAR_BG }}
      >
        <AlertTriangle className="h-3.5 w-3.5 text-ui-amber" />
        <span className="text-xs text-zinc-400">{error}</span>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-2 text-xs text-zinc-300 hover:text-zinc-100"
          onClick={onRetry}
        >
          재시도
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div
        className="flex h-[30px] shrink-0 items-center gap-1.5 px-2"
        style={{ backgroundColor: TAB_BAR_BG }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-4 w-16 animate-pulse rounded"
            style={{ backgroundColor: 'oklch(0.24 0.006 286)' }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className="flex h-[30px] shrink-0 items-stretch border-b"
      style={{
        backgroundColor: isDragOverFromOther
          ? 'oklch(0.20 0.012 243.5 / 0.3)'
          : TAB_BAR_BG,
        borderColor: 'oklch(0.35 0.006 286)',
        transition: 'background-color 150ms',
      }}
      onDragEnter={handleTabBarDragEnter}
      onDragLeave={handleTabBarDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {showLeftArrow && (
        <button
          className="flex w-5 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-300"
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

          return (
            <div
              key={tab.id}
              data-tab-id={tab.id}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                'group relative flex min-w-[80px] max-w-[180px] cursor-pointer items-center gap-1 px-3 text-xs transition-opacity duration-150 select-none',
                isActive && 'text-zinc-200',
                !isActive && 'text-zinc-400 hover:text-zinc-200',
                isDragging && 'opacity-30',
                tab.id === closingTabId && 'pointer-events-none opacity-0',
              )}
              style={{
                backgroundColor: isActive ? TAB_ACTIVE_BG : undefined,
                borderBottom: isActive
                  ? '2px solid var(--ui-blue)'
                  : '2px solid transparent',
              }}
              onMouseEnter={(e) => {
                if (!isActive && !isDragging) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = TAB_HOVER_BG;
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLElement).style.backgroundColor = '';
                }
              }}
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
                ghost.textContent = tab.name;
                ghost.style.cssText =
                  'position:fixed;left:-9999px;padding:4px 12px;background:oklch(0.21 0.006 286);color:#e4e4e4;border-radius:4px;font-size:12px;opacity:0.6;transform:scale(0.9);white-space:nowrap;';
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
                  className="w-full min-w-0 border-b border-ui-blue bg-transparent text-xs text-zinc-200 outline-none"
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
                <span className="truncate">{tab.name}</span>
              )}

              <button
                className={cn(
                  'ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-600 hover:text-zinc-200',
                  isActive ? 'visible' : 'invisible group-hover:visible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  if (closingTabId) return;
                  setClosingTabId(tab.id);
                  setTimeout(() => {
                    setClosingTabId(null);
                    onDeleteTab(tab.id);
                  }, 150);
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
          className="flex w-5 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-300"
          onClick={() => scrollBy(120)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}

      <div
        className="flex shrink-0 items-center"
        style={{ borderLeft: '1px solid oklch(0.35 0.006 286)' }}
      >
        {/* Add tab */}
        <button
          className={cn(
            'flex h-full w-[28px] items-center justify-center text-zinc-500 hover:text-zinc-300',
            isCreating && 'pointer-events-none opacity-50',
          )}
          onClick={onCreateTab}
          disabled={isCreating}
          aria-label="새 탭"
          title="새 탭"
        >
          {isCreating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
        </button>

        {/* Split horizontal (panels side by side, vertical divider ┃) */}
        <button
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-zinc-500',
            canSplit
              ? 'hover:bg-[oklch(0.24_0.006_286)] hover:text-zinc-300'
              : 'cursor-not-allowed opacity-30',
          )}
          onClick={canSplit ? onSplitHorizontal : undefined}
          disabled={!canSplit}
          aria-label="수직 분할"
          aria-disabled={!canSplit}
          title="수직 분할"
        >
          {isSplitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PanelRight className="h-3 w-3" />
          )}
        </button>

        {/* Split vertical (panels stacked, horizontal divider ━) */}
        <button
          className={cn(
            'flex h-6 w-6 items-center justify-center rounded-full text-zinc-500',
            canSplit
              ? 'hover:bg-[oklch(0.24_0.006_286)] hover:text-zinc-300'
              : 'cursor-not-allowed opacity-30',
          )}
          onClick={canSplit ? onSplitVertical : undefined}
          disabled={!canSplit}
          aria-label="수평 분할"
          aria-disabled={!canSplit}
          title="수평 분할"
        >
          {isSplitting ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <PanelBottom className="h-3 w-3" />
          )}
        </button>

        {/* Close pane — only visible when 2+ panes, disabled during splitting */}
        {paneCount >= 2 && (
          <button
            className={cn(
              'flex h-full w-[24px] items-center justify-center text-zinc-500',
              isSplitting ? 'pointer-events-none opacity-30' : 'hover:text-zinc-300',
            )}
            style={{
              borderRadius: 0,
            }}
            disabled={isSplitting}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor =
                'oklch(0.28 0.02 20)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.backgroundColor = '';
            }}
            onClick={(e) => {
              e.stopPropagation();
              onClosePane();
            }}
            aria-label="Pane 닫기"
            title="Pane 닫기"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
};

export default PaneTabBar;
