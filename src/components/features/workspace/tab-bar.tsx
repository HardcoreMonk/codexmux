import { useState, useRef, useEffect, useCallback } from 'react';
import { Plus, X, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/spinner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { ITab } from '@/types/terminal';
import TabStatusIndicator from '@/components/features/workspace/tab-status-indicator';

interface ITabBarProps {
  tabs: ITab[];
  activeTabId: string | null;
  isLoading: boolean;
  error: string | null;
  isCreating: boolean;
  onSwitchTab: (tabId: string) => void;
  onCreateTab: () => void;
  onDeleteTab: (tabId: string) => void;
  onRenameTab: (tabId: string, name: string) => void;
  onReorderTabs: (tabIds: string[]) => void;
  onRetry: () => void;
}

const TabBar = ({
  tabs,
  activeTabId,
  isLoading,
  error,
  isCreating,
  onSwitchTab,
  onCreateTab,
  onDeleteTab,
  onRenameTab,
  onReorderTabs,
  onRetry,
}: ITabBarProps) => {
  const t = useTranslations('terminal');
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
    el.scrollLeft += e.deltaX + e.deltaY;
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

  const handleDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const rect = e.currentTarget.getBoundingClientRect();
    const side = e.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
    setDropTarget({ id: tabId, side });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    if (!draggedId || !dropTarget || draggedId === dropTarget.id) {
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

  if (error) {
    return (
      <div className="flex h-[30px] shrink-0 items-center gap-2 bg-background px-3">
        <AlertTriangle className="h-3.5 w-3.5 text-ui-amber" />
        <span className="text-xs text-muted-foreground">{error}</span>
        <Button
          variant="ghost"
          size="xs"
          className="h-5 px-2 text-xs text-foreground hover:text-foreground"
          onClick={onRetry}
        >
          {t('retryLoad')}
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-[30px] shrink-0 items-center gap-1.5 bg-background px-2">
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
    <div className="flex h-[30px] shrink-0 items-stretch border-b border-border bg-background">
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
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
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
                'group relative flex min-w-[80px] max-w-[180px] cursor-pointer items-center gap-1 border-b-2 px-3 text-xs select-none',
                isActive
                  ? 'border-b-accent-color bg-secondary text-foreground'
                  : 'border-b-transparent text-muted-foreground hover:bg-accent hover:text-foreground',
                isDragging && 'opacity-70',
              )}
              onClick={() => {
                if (!isEditing && !isActive) onSwitchTab(tab.id);
              }}
              onDoubleClick={() => startEditing(tab)}
              draggable={!isEditing}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tab.id);
                setDraggedTabId(tab.id);
              }}
              onDragEnd={() => {
                setDraggedTabId(null);
                setDropTarget(null);
              }}
              onDragOver={(e) => handleDragOver(e, tab.id)}
              onDragLeave={() => setDropTarget(null)}
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
                  <TabStatusIndicator
                    tabId={tab.id}
                    panelType={tab.panelType}
                  />
                  <span className="truncate">{tab.name}</span>
                </>
              )}

              <button
                className={cn(
                  'ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground',
                  isActive
                    ? 'visible'
                    : 'invisible group-hover:visible',
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteTab(tab.id);
                }}
                aria-label={t('closeTabLabel')}
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

      <button
        className={cn(
          'flex w-[30px] shrink-0 items-center justify-center border-l border-border text-muted-foreground hover:bg-accent hover:text-foreground',
          isCreating && 'pointer-events-none opacity-50',
        )}
        onClick={onCreateTab}
        disabled={isCreating}
        aria-label={t('newTabLabel')}
      >
        {isCreating ? (
          <Spinner className="h-3 w-3" />
        ) : (
          <Plus className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
};

export default TabBar;
